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
    // 画面を落としたくない場合は基本使わず、json({ok:false})で返す
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
// ---------- handlers ----------
const handlers = {
    async "send-username-list"(params = {}) {
        const minutesRaw = params?.minutes;
        const minutes = typeof minutesRaw === "number" && isFinite(minutesRaw) && minutesRaw > 0 ? minutesRaw : 10;
        const data = await fetchRecentUsernames(minutes);
        return json(data, 200);
    },
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
    async "decide-and-route"(_params = {}) {
        const minutes = 10;
        const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
        const recentUsers = await fetchRecentUsernames(minutes);
        const usersCount = recentUsers.length;
        const { data: readyRows, error: readyErr } = await supabaseAdmin.from("is_ready").select("tab_id,user_name,created_at").gte("created_at", since).order("created_at", {
            ascending: true
        });
        if (readyErr) return json({
            ok: false,
            error: readyErr.message
        }, 200);
        const readyCount = readyRows?.length ?? 0;
        if (readyCount === 0 || readyCount !== usersCount) {
            return json({
                ok: true,
                matched: false,
                counts: {
                    ready: readyCount,
                    users: usersCount
                }
            }, 200);
        }
        const leader = readyRows[0];
        const leaderTab = leader.tab_id;
        const routes = readyRows.map((r) => ({
            tab_id: r.tab_id,
            to: r.tab_id === leaderTab ? "/parenttopick" : "/childwating"
        }));
        return json({
            ok: true,
            matched: true,
            leader_tab_id: leaderTab,
            routes,
            counts: {
                ready: readyCount,
                users: usersCount
            }
        });
    },
    // Standby用：tab_id から現在の部屋情報
    async "get-tab-room-info"(params = {}) {
        const tab_id = String(params?.tab_id ?? "").trim();
        if (!tab_id) return json({
            ok: true,
            room_name: null,
            num_of_r: null,
            members: [],
            num_of_s: 0
        }, 200);
        // 自タブの最新行
        const { data: meRows, error: meErr } = await supabaseAdmin.from("User_list_test").select("user_name, room_name, created_at").eq("tab_id", tab_id).order("created_at", {
            ascending: false
        }).limit(1);
        if (meErr) return json({
            ok: false,
            error: meErr.message
        }, 200);
        const myRow = (meRows ?? [])[0];
        const room_name = myRow && typeof myRow.room_name === "string" && myRow.room_name.trim() ? myRow.room_name.trim() : null;
        if (!room_name) {
            return json({
                ok: true,
                room_name: null,
                num_of_r: null,
                members: [],
                num_of_s: 0
            }, 200);
        }
        // 同 room_name の参加者一覧
        const { data: membersRows, error: memErr } = await supabaseAdmin.from("User_list_test").select("user_name, created_at").eq("room_name", room_name).order("created_at", {
            ascending: true
        });
        if (memErr) return json({
            ok: false,
            error: memErr.message
        }, 200);
        const members = (membersRows ?? []).map((r) => typeof r.user_name === "string" ? r.user_name : null).filter((v) => !!v);
        const count = members.length;
        // room_info の最新行（name一致）から num_of_r 取得
        const { data: roomInfoRows, error: infoErr } = await supabaseAdmin.from("room_info").select("id, num_of_r, num_of_s, created_at").eq("name", room_name).order("created_at", {
            ascending: false
        }).limit(1);
        if (infoErr) return json({
            ok: false,
            error: infoErr.message
        }, 200);
        const latestInfo = (roomInfoRows ?? [])[0];
        const num_of_r = latestInfo?.num_of_r ?? null;
        // num_of_s を count に同期（失敗しても致命ではない）
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
            return await handler(params, req);
        }
        return errorJson("Method Not Allowed", 405);
    } catch (err) {
        const message = err instanceof Error ? err.message : typeof err === "string" ? err : "Unexpected error";
        return errorJson(message, 500);
    }
});
