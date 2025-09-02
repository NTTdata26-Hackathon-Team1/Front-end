// ---------- imports (トップレベルのみ) ----------
import { corsHeaders, handleCorsOptions } from "./cors.ts";
import { fetchRecentUsernames } from "./recentUsers.ts";
import { pushMessageToTab } from "./writers.ts";
import { supabaseAdmin } from "./supabaseAdmin.ts";
// ---------- helpers ----------
function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
        }
    });
}
function errorJson(message, status = 400) {
    return json({
        ok: false,
        error: message
    }, status);
}
async function readJson(req) {
    const ctype = req.headers.get("content-type") ?? "";
    if (!ctype.toLowerCase().includes("application/json")) return null;
    try {
        return await req.json();
    } catch {
        return null;
    }
}
// [最新, 最古, 2番目に古い, ...] に並べ替えるユーティリティ
function newestFirstThenOldAsc(rows) {
    if (!rows || rows.length === 0) return [];
    const asc = [
        ...rows
    ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); // 古い→新しい
    const newest = asc[asc.length - 1];
    return [
        newest,
        ...asc.slice(0, asc.length - 1)
    ];
}
// ---------- handlers ----------
const handlers = {
    // 10分以内のユーザー名一覧
    async "send-username-list"(params = {}) {
        const minutesRaw = params?.minutes;
        const minutes = typeof minutesRaw === "number" && isFinite(minutesRaw) && minutesRaw > 0 ? minutesRaw : 10;
        const data = await fetchRecentUsernames(minutes);
        return json(data, 200);
    },
    // ユーザー保存（任意）
    async "save-user"(params = {}) {
        const user_name = String(params?.user_name ?? "").trim();
        const tab_id = String(params?.tab_id ?? "").trim();
        const device_id = String(params?.device_id ?? "").trim();
        const room_name = String(params?.room_name ?? "").trim();
        const user_id = typeof params?.user_id === "string" && params.user_id ? String(params.user_id) : null;
        if (!user_name || !tab_id || !device_id) {
            return json({
                ok: false,
                error: "user_name/tab_id/device_id are required"
            }, 200);
        }
        const row = {
            user_id,
            user_name,
            tab_id,
            device_id,
            room_name: room_name || null
        };
        const { data, error } = await supabaseAdmin.from("User_list_test").insert([
            row
        ]).select().single();
        if (error) return json({
            ok: false,
            error: error.message
        }, 200);
        return json({
            ok: true,
            row: data
        }, 201);
    },
    // 部屋入室（任意）
    async "join-room"(params = {}) {
        const user_name = String(params?.user_name ?? "").trim();
        const tab_id = String(params?.tab_id ?? "").trim();
        const device_id = String(params?.device_id ?? "").trim();
        const room_name = String(params?.room_name ?? "").trim();
        const user_id = typeof params?.user_id === "string" && params.user_id ? String(params.user_id) : null;
        if (!user_name || !tab_id || !device_id || !room_name) {
            return json({
                ok: false,
                error: "user_name/tab_id/device_id/room_name are required"
            }, 200);
        }
        const payload = {
            user_id,
            user_name,
            tab_id,
            device_id,
            room_name
        };
        const { data, error } = await supabaseAdmin.from("User_list_test").insert([
            payload
        ]).select().single();
        if (error) return json({
            ok: false,
            error: error.message
        }, 200);
        return json({
            ok: true,
            row: data
        }, 201);
    },
    // タブへプッシュ（任意）
    async "push-to-tab"(params = {}) {
        const target_user_id = String(params?.target_user_id ?? "").trim();
        const tab_id = typeof params?.tab_id === "string" ? String(params.tab_id).trim() : undefined;
        const device_id = typeof params?.device_id === "string" ? String(params.device_id).trim() : undefined;
        const type = String(params?.type ?? "").trim();
        const payload = params?.payload ?? {};
        if (!target_user_id || !type) return json({
            ok: false,
            error: "invalid params"
        }, 200);
        const inserted = await pushMessageToTab({
            user_id: target_user_id,
            tab_id,
            device_id,
            type,
            payload
        });
        return json({
            ok: true,
            message: inserted
        }, 201);
    },
  /**
   * ★ decide-and-route（ご指定ロジック）
   * - 入力: { tab_id }
   * - is_ready から自タブの room_name を取得
   * - a = is_ready(room_name 同一)件数 / b = room_info(name=room_name).num_of_u
   * - a=b のときにだけ進行
   * - User_list_test(room_name) を [最新, 最古, 2番目に古い, ...] に並べ、n と N を算出
   * - dynamic_user_info に自タブの行が無ければ round=1 で INSERT
   *   → (round % N === n) で now_host を決めて保存
   * - 既存行があれば round を +1 して UPDATE
   *   → (round % N === n) で now_host を上書き
   * - now_host=true なら /parenttopick、false なら /childwating
   */ async "decide-and-route"(params = {}) {
        const tab_id = String(params?.tab_id ?? "").trim();
        if (!tab_id) return json({
            ok: false,
            matched: false,
            error: "tab_id is required"
        }, 200);
        // 1) is_ready から自分の room_name を取得
        const { data: myReady, error: rErr } = await supabaseAdmin.from("is_ready").select("room_name, user_name").eq("tab_id", tab_id).order("created_at", {
            ascending: false
        }).limit(1).maybeSingle();
        if (rErr) return json({
            ok: false,
            matched: false,
            error: rErr.message
        }, 200);
        if (!myReady?.room_name) {
            return json({
                ok: true,
                matched: false,
                reason: "not ready yet"
            }, 200);
        }
        const room_name = String(myReady.room_name);
        // 2) a = is_ready(room_name) 件数
        const { count: a, error: aErr } = await supabaseAdmin.from("is_ready").select("id", {
            count: "exact",
            head: true
        }).eq("room_name", room_name);
        if (aErr) return json({
            ok: false,
            matched: false,
            error: aErr.message
        }, 200);
        // 3) b = room_info.name=room_name の num_of_u
        const { data: roomInfo, error: bErr } = await supabaseAdmin.from("room_info").select("num_of_u").eq("name", room_name).order("created_at", {
            ascending: false
        }).limit(1).maybeSingle();
        if (bErr) return json({
            ok: false,
            matched: false,
            error: bErr.message
        }, 200);
        const b = roomInfo?.num_of_u ?? null;
        if (!b || (a ?? 0) !== b) {
            return json({
                ok: true,
                matched: false,
                counts: {
                    a: a ?? 0,
                    b: b ?? 0
                }
            }, 200);
        }
        // 4) 部屋のメンバー順序（[最新, 最古, 2番目に古い, ...]）
        const { data: peers, error: pErr } = await supabaseAdmin.from("User_list_test").select("tab_id, user_name, created_at").eq("room_name", room_name).order("created_at", {
            ascending: true
        });
        if (pErr) return json({
            ok: false,
            matched: false,
            error: pErr.message
        }, 200);
        const ordered = newestFirstThenOldAsc(peers ?? []);
        const N = ordered.length;
        if (N === 0) return json({
            ok: false,
            matched: false,
            error: "no peers in room"
        }, 200);
        let n = ordered.findIndex((r) => r.tab_id === tab_id);
        if (n < 0) n = 0;
        // 5) dynamic_user_info: 自タブのレコード有無
        const { data: duiRow, error: dSelErr } = await supabaseAdmin.from("dynamic_user_info").select("id, round").eq("tab_id", tab_id).limit(1).maybeSingle();
        if (dSelErr) return json({
            ok: false,
            matched: false,
            error: dSelErr.message
        }, 200);
        let newRound;
        let hostFlag;
        if (!duiRow) {
            // 無ければ round=1 で新規作成
            newRound = 1;
            hostFlag = newRound % N === n;
            // user_name は is_ready の user_name を優先（無ければ peers から探す）
            const user_name = myReady?.user_name ?? ordered.find((r) => r.tab_id === tab_id)?.user_name ?? null;
            const payload = {
                id: crypto.randomUUID(),
                tab_id,
                user_name,
                now_host: hostFlag,
                input_QA: null,
                vote_to: null,
                round: newRound
            };
            const { error: insErr } = await supabaseAdmin.from("dynamic_user_info").insert([
                payload
            ]);
            if (insErr) return json({
                ok: false,
                matched: false,
                error: insErr.message
            }, 200);
        } else {
            // 既存なら round を +1 して now_host を再計算して UPDATE
            newRound = (duiRow.round ?? 0) + 1;
            hostFlag = newRound % N === n;
            const { error: updErr } = await supabaseAdmin.from("dynamic_user_info").update({
                round: newRound,
                now_host: hostFlag
            }).eq("id", duiRow.id);
            if (updErr) return json({
                ok: false,
                matched: false,
                error: updErr.message
            }, 200);
        }
        return json({
            ok: true,
            matched: true,
            now_host: hostFlag,
            to: hostFlag ? "/parenttopick" : "/childwating",
            round: newRound,
            room_name,
            n,
            N
        }, 200);
    },
    // Standby: tab_id から現在の部屋情報を返す
    async "get-tab-room-info"(params = {}) {
        const tab_id = String(params?.tab_id ?? "").trim();
        if (!tab_id) return json({
            ok: true,
            room_name: null,
            num_of_r: null,
            members: [],
            num_of_s: 0
        }, 200);
        const { data: meRows, error: meErr } = await supabaseAdmin.from("User_list_test").select("user_name, room_name, created_at").eq("tab_id", tab_id).order("created_at", {
            ascending: false
        }).limit(1);
        if (meErr) return json({
            ok: false,
            error: meErr.message
        }, 200);
        const myRow = (meRows ?? [])[0];
        const room_name = myRow && typeof myRow.room_name === "string" && myRow.room_name.trim() ? myRow.room_name.trim() : null;
        if (!room_name) return json({
            ok: true,
            room_name: null,
            num_of_r: null,
            members: [],
            num_of_s: 0
        }, 200);
        const { data: membersRows, error: memErr } = await supabaseAdmin.from("User_list_test").select("user_name, created_at").eq("room_name", room_name).order("created_at", {
            ascending: true
        });
        if (memErr) return json({
            ok: false,
            error: memErr.message
        }, 200);
        const members = (membersRows ?? []).map((r) => typeof r.user_name === "string" ? r.user_name : null).filter((v) => !!v);
        const count = members.length;
        const { data: roomInfoRows, error: infoErr } = await supabaseAdmin.from("room_info").select("id, num_of_r, num_of_s, created_at").eq("name", room_name).order("created_at", {
            ascending: false
        }).limit(1);
        if (infoErr) return json({
            ok: false,
            error: infoErr.message
        }, 200);
        const latestInfo = (roomInfoRows ?? [])[0];
        const num_of_r = latestInfo?.num_of_r ?? null;
        if (latestInfo && latestInfo.id !== undefined) {
            await supabaseAdmin.from("room_info").update({
                num_of_s: count
            }).eq("id", latestInfo.id);
        }
        return json({
            ok: true,
            room_name,
            num_of_r,
            members,
            num_of_s: count
        }, 200);
    },
    // tab_id を受け取り、User_list_test から user_name/room_name を引いて is_ready へ保存
    async "mark-ready"(params = {}) {
        const tab_id = String(params?.tab_id ?? "").trim();
        if (!tab_id) return json({
            ok: false,
            error: "tab_id is required"
        }, 200);
        const { data: meRow, error: meErr } = await supabaseAdmin.from("User_list_test").select("user_name, room_name, created_at").eq("tab_id", tab_id).order("created_at", {
            ascending: false
        }).limit(1).maybeSingle();
        if (meErr) return json({
            ok: false,
            error: meErr.message
        }, 200);
        if (!meRow) return json({
            ok: false,
            error: "tab_id not found in User_list_test"
        }, 200);
        const payload = {
            tab_id,
            user_name: meRow.user_name ?? null,
            room_name: meRow.room_name ?? null,
            is_ready: true
        };
        const { data, error } = await supabaseAdmin.from("is_ready").insert([
            payload
        ]).select().single();
        if (error) return json({
            ok: false,
            error: error.message
        }, 200);
        return json({
            ok: true,
            row: data
        }, 201);
    }
};
// ---------- entrypoint ----------
Deno.serve(async (req) => {
    const preflight = handleCorsOptions(req);
    if (preflight) return preflight;
    try {
        if (req.method === "GET") {
            const { searchParams } = new URL(req.url);
            const minutes = Number(searchParams.get("minutes") ?? "10");
            const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 10;
            const data = await fetchRecentUsernames(safeMinutes);
            return json(data, 200);
        }
        if (req.method === "POST") {
            const body = await readJson(req);
            if (!body) return errorJson("Invalid JSON body", 400);
            const method = body["method"] ?? body["action"] ?? "send-username-list";
            const handler = handlers[method];
            if (!handler) return errorJson(`Unknown method: ${method}`, 400);
            const params = body["params"] ?? {};
            return await handler(params);
        }
        return errorJson("Method Not Allowed", 405);
    } catch (err) {
        const message = err instanceof Error ? err.message : typeof err === "string" ? err : "Unexpected error";
        return errorJson(message, 500);
    }
});
