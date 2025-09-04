import { createClient } from "npm:@supabase/supabase-js@2";
// ---- CORS ----
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS"
};
const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
    }
});
const err = (msg, status = 400) => json({
    ok: false,
    error: msg
}, status);
// ---- Supabase Admin Client ----
const url = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !serviceKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(url, serviceKey, {
    auth: {
        persistSession: false
    }
});
// ---- Utils ----
async function readJson(req) {
    const ctype = req.headers.get("content-type") ?? "";
    if (!ctype.toLowerCase().includes("application/json")) return null;
    try {
        return await req.json();
    } catch {
        return null;
    }
}
// ===== ハンドラ群 =====
const handlers = {
  /**
   * ラウンド初期化＆取得（等幹）
   */ async "init-round"(params = {}) {
        const tab_id = String(params?.tab_id ?? "").trim();
        let user_name = String(params?.user_name ?? "").trim();
        if (!tab_id) return json({
            ok: false,
            error: "tab_id is required"
        }, 200);
        // 1) 自分の room_name を取得
        const { data: meRow, error: meErr } = await supabase.from("User_list_test").select("room_name,user_name,created_at").eq("tab_id", tab_id).order("created_at", {
            ascending: false
        }).limit(1).maybeSingle();
        if (meErr) return json({
            ok: false,
            error: meErr.message ?? "DB select failed (User_list_test self)"
        }, 200);
        if (!meRow?.room_name) return json({
            ok: false,
            error: "room_name not found for this tab_id"
        }, 200);
        if (!user_name) user_name = meRow.user_name ?? "";
        const room_name = String(meRow.room_name);
        // 2) 同室メンバー（古い→新しい）
        const { data: peers, error: peersErr } = await supabase.from("User_list_test").select("tab_id,created_at").eq("room_name", room_name).order("created_at", {
            ascending: true
        });
        if (peersErr) return json({
            ok: false,
            error: peersErr.message ?? "DB select failed (User_list_test peers)"
        }, 200);
        const list = peers ?? [];
        const N = list.length;
        if (N === 0) return json({
            ok: false,
            error: "no peers found for this room_name"
        }, 200);
        // 並びを [最新, 最古, 2番目に古い, ...] に
        const newest = list[list.length - 1];
        const ordered = [
            newest,
            ...list.slice(0, list.length - 1)
        ];
        let n = ordered.findIndex((r) => r.tab_id === tab_id);
        if (n < 0) n = 0;
        const participantTabIds = ordered.map((r) => r.tab_id);
        // 3) 部屋の最新 round（roomMax）を取得
        let roomMax = 0;
        if (participantTabIds.length > 0) {
            const { data: lastRows, error: lastErr } = await supabase.from("dynamic_user_info").select("round").in("tab_id", participantTabIds).order("round", {
                ascending: false,
                nullsFirst: false
            }).limit(1);
            if (lastErr) return json({
                ok: false,
                error: lastErr.message ?? "DB select failed (dynamic_user_info max round by room)"
            }, 200);
            roomMax = lastRows && lastRows[0] && typeof lastRows[0].round === "number" ? lastRows[0].round : 0;
        }
        // 4) 自分の最新 round を確認
        const { data: myLastRows, error: myLastErr } = await supabase.from("dynamic_user_info").select("round").eq("tab_id", tab_id).order("created_at", {
            ascending: false
        }).limit(1);
        if (myLastErr) return json({
            ok: false,
            error: myLastErr.message ?? "DB select failed (dynamic_user_info my last)"
        }, 200);
        const myLast = myLastRows && myLastRows[0] && typeof myLastRows[0].round === "number" ? myLastRows[0].round : null;
        if (myLast !== null && myLast === roomMax && roomMax > 0) return json({
            ok: true,
            round: roomMax
        }, 200);
        // 5) 次のラウンド
        const nextRound = roomMax + 1;
        const host = N > 0 ? nextRound % N === n : false;
        // 二重挿入防止
        const { data: dupRows, error: dupErr } = await supabase.from("dynamic_user_info").select("id,round").eq("tab_id", tab_id).eq("round", nextRound).limit(1);
        if (dupErr) return json({
            ok: false,
            error: dupErr.message ?? "DB select failed (dup check)"
        }, 200);
        if (dupRows && dupRows.length > 0) return json({
            ok: true,
            round: nextRound
        }, 200);
        // 6) 挿入（schema に合わせて必要最小限）
        const payload = {
            id: crypto.randomUUID(),
            tab_id,
            user_name: user_name || null,
            now_host: host,
            input_QA: null,
            vote_to: null,
            round: nextRound
        };
        const { error: insErr } = await supabase.from("dynamic_user_info").insert([
            payload
        ]);
        if (insErr) return json({
            ok: false,
            error: insErr.message ?? "DB insert failed (dynamic_user_info)"
        }, 200);
        return json({
            ok: true,
            round: nextRound
        }, 200);
    },
  /**
   * 親: お題を保存（更新版）
   */ async "submit-topic"(params = {}) {
        const txt = String(params?.txt ?? "").trim();
        const tab_id = String(params?.tab_id ?? "").trim();
        if (!txt) return err("txt is required", 422);
        if (!tab_id) return err("tab_id is required", 422);
        const { data: row, error: selErr } = await supabase.from("dynamic_user_info").select("id").eq("tab_id", tab_id).order("created_at", {
            ascending: false
        }).limit(1).maybeSingle();
        if (selErr) return err(selErr.message ?? "DB select failed", 500);
        if (!row?.id) return err("target row for this tab_id not found (call init-round first)", 404);
        const { data, error: updErr } = await supabase.from("dynamic_user_info").update({
            input_QA: txt
        }).eq("id", row.id).select().single();
        if (updErr) return err(updErr.message ?? "DB update failed", 500);
        return json({
            ok: true,
            row: data
        }, 200);
    },
  /**
   * 子: 回答を保存（更新 or 新規）
   */ async "submit-answer"(params = {}) {
        const txt = String(params?.txt ?? "").trim();
        const tab_id = String(params?.tab_id ?? "").trim();
        const user_name = String(params?.user_name ?? "").trim();
        if (!txt) return err("txt is required", 422);
        if (!tab_id) return err("tab_id is required", 422);
        // 既存探索
        const { data: existing, error: findErr } = await supabase.from("dynamic_user_info").select("id").eq("tab_id", tab_id).order("created_at", {
            ascending: false
        }).limit(1).maybeSingle();
        if (findErr) return err(findErr.message ?? "DB select failed", 500);
        if (existing?.id) {
            const { data, error: updErr } = await supabase.from("dynamic_user_info").update({
                input_QA: txt
            }).eq("id", existing.id).select().single();
            if (updErr) return err(updErr.message ?? "DB update failed", 500);
            return json({
                ok: true,
                row: data,
                updated: true
            }, 200);
        }
        if (!user_name) return err("user_name is required when inserting new answer", 422);
        const payload = {
            id: crypto.randomUUID(),
            tab_id,
            user_name,
            now_host: false,
            input_QA: txt,
            vote_to: null,
            round: 1
        };
        const { data, error } = await supabase.from("dynamic_user_info").insert([
            payload
        ]).select().single();
        if (error) return err(error.message ?? "DB insert failed", 500);
        return json({
            ok: true,
            row: data,
            created: true
        }, 201);
    },
  /**
   * 子: お題が用意できたか？
   *  - 入力: { tab_id }
   *  - 手順:
   *    1) User_list_test から tab_id に対応する room_name を取得
   *    2) dynamic_user_info から「この tab_id の最新 round」を取得
   *    3) 同じ room_name のメンバーの tab_id 一覧を取得
   *    4) dynamic_user_info を (now_host=true) AND (round=上記) AND (tab_id ∈ 同室メンバー) で検索
   *    5) 見つかった行の input_QA が null でなければ ready=true
   *  - 失敗や未準備の場合でも **200** で返し、ok=false/ready=false をボディに載せる
   */ async "is-topic-ready"(params = {}) {
        const tab_id = String(params?.tab_id ?? "").trim();
        if (!tab_id) return json({
            ok: false,
            ready: false,
            error: "tab_id is required"
        }, 200);
        // 1) room_name
        const { data: meRow, error: meErr } = await supabase.from("User_list_test").select("room_name").eq("tab_id", tab_id).order("created_at", {
            ascending: false
        }).limit(1).maybeSingle();
        if (meErr) return json({
            ok: false,
            ready: false,
            error: meErr.message ?? "DB select failed (User_list_test)"
        }, 200);
        const room_name = meRow?.room_name ? String(meRow.room_name) : null;
        if (!room_name) return json({
            ok: true,
            ready: false
        }, 200);
        // 2) 最新 round（この tab_id の）
        const { data: myRow, error: myErr } = await supabase.from("dynamic_user_info").select("round").eq("tab_id", tab_id).order("created_at", {
            ascending: false
        }).limit(1).maybeSingle();
        if (myErr) return json({
            ok: false,
            ready: false,
            error: myErr.message ?? "DB select failed (dynamic_user_info round)"
        }, 200);
        const round = typeof myRow?.round === "number" ? myRow.round : null;
        if (round === null) return json({
            ok: true,
            ready: false
        }, 200);
        // 3) 同室メンバーの tab_id 群
        const { data: peers, error: pErr } = await supabase.from("User_list_test").select("tab_id").eq("room_name", room_name);
        if (pErr) return json({
            ok: false,
            ready: false,
            error: pErr.message ?? "DB select failed (User_list_test peers)"
        }, 200);
        const peerIds = (peers ?? []).map((r) => r.tab_id).filter(Boolean);
        if (peerIds.length === 0) return json({
            ok: true,
            ready: false
        }, 200);
        // 4) 同室 & 該当ラウンドの host 行
        const { data: hostRow, error: hErr } = await supabase.from("dynamic_user_info").select("input_QA, tab_id").eq("now_host", true).eq("round", round).in("tab_id", peerIds).order("created_at", {
            ascending: false
        }).limit(1).maybeSingle();
        if (hErr) return json({
            ok: false,
            ready: false,
            error: hErr.message ?? "DB select failed (dynamic_user_info host)"
        }, 200);
        const ready = hostRow?.input_QA !== null && hostRow?.input_QA !== undefined;
        return json({
            ok: true,
            ready
        }, 200);
    },
    // 現在のお題（既存：グローバル最新）
    async "get-current-topic"() {
        const { data, error } = await supabase.from("dynamic_user_info").select("input_QA").eq("now_host", true).not("input_QA", "is", null).order("created_at", {
            ascending: false
        }).limit(1);
        if (error) return err(error.message ?? "DB select failed", 500);
        const topic = data && data.length > 0 ? data[0].input_QA : "";
        return json({
            ok: true,
            topic
        }, 200);
    },
    // 子の回答一覧を取得
    async "list-child-answers"(params = {}) {
        const tab_id = String(params?.tab_id ?? "").trim();
        if (!tab_id) return err("tab_id is required", 422);
        // 1) 自分の room_name を取得
        const { data: meRow, error: meErr } = await supabase
            .from("User_list_test")
            .select("room_name")
            .eq("tab_id", tab_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (meErr) return err(meErr.message ?? "DB select failed (User_list_test self)", 500);
        const room_name = meRow?.room_name ? String(meRow.room_name) : null;
        // room_name が無い場合は空配列を返す（同室不明のため）
        if (!room_name) {
            return json({ ok: true, answers: [] }, 200);
        }
        // 2) 同室メンバーの tab_id 群を取得
        const { data: peers, error: peersErr } = await supabase
            .from("User_list_test")
            .select("tab_id")
            .eq("room_name", room_name);
        if (peersErr) return err(peersErr.message ?? "DB select failed (User_list_test peers)", 500);
        const peerIds = (peers ?? [])
            .map((r) => r.tab_id)
            .filter((v) => typeof v === "string" && v.length > 0);
        if (peerIds.length === 0) {
            return json({ ok: true, answers: [] }, 200);
        }
        // 3) 同室メンバーのうち、now_host=false かつ input_QA が null でない子の回答を取得（古い→新しい）
        const { data, error } = await supabase
            .from("dynamic_user_info")
            .select("user_name,input_QA")
            .in("tab_id", peerIds)
            .eq("now_host", false)
            .not("input_QA", "is", null)
            .order("created_at", { ascending: true });
        if (error) return err(error.message ?? "DB select failed (dynamic_user_info)", 500);
        // 4) 型を絞って最終レスポンス整形
        const answers = (data ?? [])
            .filter((r) => typeof r.user_name === "string" && typeof r.input_QA === "string")
            .map((r) => ({ user_name: r.user_name, input_QA: r.input_QA }));
        return json({ ok: true, answers }, 200);
    },

    // 親待機の判定（tab_id ベース／同室集計）
    async "are-children-answers-complete"(params = {}) {
        const tab_id = String(params?.tab_id ?? "").trim();
        if (!tab_id) return err("tab_id is required", 422);
        // 1) is_ready から自分の room_name を取得
        const { data: meRow, error: meErr } = await supabase
            .from("is_ready")
            .select("room_name")
            .eq("tab_id", tab_id)
            .limit(1)
            .maybeSingle();
        if (meErr) return err(meErr.message ?? "DB select failed (is_ready self)", 500);
        const room_name = meRow?.room_name ? String(meRow.room_name) : null;
        if (!room_name) {
            // 同室が特定できない場合は未準備扱いで返す
            return json({ ok: true, ready: false, a: 0, b: 0 }, 200);
        }
        // 2) is_ready から同室メンバーの tab_id 群と人数を取得
        const { data: roomPeers, count: roomCount, error: peersErr } = await supabase
            .from("is_ready")
            .select("tab_id", { count: "exact" })
            .eq("room_name", room_name);
        if (peersErr) return err(peersErr.message ?? "DB select failed (is_ready peers)", 500);
        const peerTabIds = (roomPeers ?? [])
            .map((r: any) => r.tab_id)
            .filter((v: any) => typeof v === "string" && v.length > 0);
        // 期待人数 a = （同室人数） - 1（ホスト想定）
        const a = Math.max(0, (roomCount ?? 0) - 1);
        // 3) dynamic_user_info から b を算出
        //    同室 tab_id 群のうち、now_host=false かつ input_QA が非 null のレコード数
        let b = 0;
        if (peerTabIds.length > 0) {
            const { count: answeredCount, error: ansErr } = await supabase
                .from("dynamic_user_info")
                .select("id", { count: "exact", head: true })
                .in("tab_id", peerTabIds)
                .eq("now_host", false)
                .not("input_QA", "is", null);
            if (ansErr) return err(ansErr.message ?? "DB select failed (dynamic_user_info answered)", 500);
            b = answeredCount ?? 0;
        }
        // 4) 判定結果を返す
        return json({ ok: true, ready: a === b, a, b }, 200);
    },

    // 親の選択画面用：候補一覧
    async "list-parent-select-answers"(params = {}) {
        const tab_id = String(params?.tab_id ?? "").trim();
        if (!tab_id) return err("tab_id is required", 422);
        // 1) tab_id から自分の room_name を取得
        const { data: meRow, error: meErr } = await supabase
            .from("User_list_test")
            .select("room_name")
            .eq("tab_id", tab_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (meErr) return err(meErr.message ?? "DB select failed (User_list_test self)", 500);
        const room_name = meRow?.room_name ? String(meRow.room_name) : null;
        if (!room_name) {
            // 同室不明なら空で返す
            return json({ ok: true, answers: [] }, 200);
        }
        // 2) 同じ room_name のメンバーの tab_id 群を取得
        const { data: peers, error: peersErr } = await supabase
            .from("User_list_test")
            .select("tab_id")
            .eq("room_name", room_name);
        if (peersErr) return err(peersErr.message ?? "DB select failed (User_list_test peers)", 500);
        const peerTabIds = (peers ?? [])
            .map((r: any) => r.tab_id)
            .filter((v: any) => typeof v === "string" && v.length > 0);
        if (peerTabIds.length === 0) {
            return json({ ok: true, answers: [] }, 200);
        }
        // 3) 同室メンバーの中から、子(now_host=false) で回答あり(input_QA not null) を取得（古い→新しい）
        const { data, error } = await supabase
            .from("dynamic_user_info")
            .select("user_name,input_QA")
            .in("tab_id", peerTabIds)
            .eq("now_host", false)
            .not("input_QA", "is", null)
            .order("created_at", { ascending: true });
        if (error) return err(error.message ?? "DB select failed (dynamic_user_info)", 500);
        // 4) 返却整形
        const answers = (data ?? [])
            .filter((r: any) => typeof r.user_name === "string" && typeof r.input_QA === "string")
            .map((r: any) => ({ user_name: r.user_name, input_QA: r.input_QA }));
        return json({ ok: true, answers }, 200);
    },

    // 親が選んだ回答を確定
    async "mark-selected-answer"(params = {}) {
        const user_name = String(params?.user_name ?? "").trim();
        const input_QA = String(params?.input_QA ?? "").trim();
        const round = Number(params?.round ?? 1) || 1;
        if (!user_name) return err("user_name is required", 422);
        if (!input_QA) return err("input_QA is required", 422);
        const { data: rows, error: selErr } = await supabase.from("dynamic_user_info").select("id,total_pt").eq("user_name", user_name).eq("input_QA", input_QA).eq("now_host", false).eq("round", round).limit(1);
        if (selErr) return err(selErr.message ?? "DB select failed", 500);
        if (!rows || rows.length === 0) return err("target row not found", 404);
        const targetId = rows[0].id;
        const nextPt = (rows[0].total_pt ?? 0) + 1;
        const { error: updErr } = await supabase.from("dynamic_user_info").update({
            total_pt: nextPt,
            vote_to: "SELECTED"
        }).eq("id", targetId);
        if (updErr) return err(updErr.message ?? "DB update failed", 500);
        return json({
            ok: true
        }, 200);
    },
    // 選出済みか？
    async "is-selection-decided"() {
        const { count, error } = await supabase.from("dynamic_user_info").select("id", {
            count: "exact",
            head: true
        }).eq("vote_to", "SELECTED");
        if (error) return err(error.message ?? "DB select failed", 500);
        return json({
            ok: true,
            decided: (count ?? 0) > 0
        }, 200);
    },
    // 最も total_pt が高い1件
    async "get-selected-answer"(params = {}) {
        const roundParam = params?.round;
        const tabId = String(params?.tab_id ?? "").trim();
        let q = supabase.from("dynamic_user_info").select("id,user_name,input_QA,total_pt,created_at,tab_id,round,now_host").eq("now_host", false).not("input_QA", "is", null);
        if (roundParam !== undefined && roundParam !== null && !Number.isNaN(Number(roundParam))) {
            q = q.eq("round", Number(roundParam));
        }
        if (tabId) q = q.eq("tab_id", tabId);
        const { data, error } = await q.order("total_pt", {
            ascending: false,
            nullsFirst: false
        }).order("created_at", {
            ascending: true
        });
        if (error) return err(error.message ?? "DB select failed", 500);
        if (!data || data.length === 0) return json({
            ok: true,
            best: null,
            others: []
        }, 200);
        const idx = data.findIndex((r) => r.total_pt !== null && r.total_pt !== undefined);
        if (idx === -1) {
            const othersAll = data.map((r) => ({
                user_name: r.user_name,
                input_QA: r.input_QA,
                total_pt: r.total_pt
            }));
            return json({
                ok: true,
                best: null,
                others: othersAll
            }, 200);
        }
        const bestRow = data[idx];
        const best = {
            user_name: bestRow.user_name,
            input_QA: bestRow.input_QA,
            total_pt: bestRow.total_pt
        };
        const others = data.filter((_, i) => i !== idx).map((r) => ({
            user_name: r.user_name,
            input_QA: r.input_QA,
            total_pt: r.total_pt
        }));
        return json({
            ok: true,
            best,
            others
        }, 200);
    }
};
// ===== エントリポイント =====
Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", {
        headers: corsHeaders
    });
    if (req.method !== "POST") return err("Method Not Allowed", 405);
    const body = await readJson(req);
    if (!body) return err("Invalid JSON body", 400);
    const method = body["method"] ?? body["action"] ?? "";
    const handler = handlers[method];
    if (!handler) return err(`Unknown method: ${method}`, 400);
    const params = body["params"] ?? body;
    return handler(params);
});
