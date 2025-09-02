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
            if (lastErr) {
                return json({
                    ok: false,
                    error: lastErr.message ?? "DB select failed (dynamic_user_info max round by room)"
                }, 200);
            }
            roomMax = lastRows && lastRows[0] && typeof lastRows[0].round === "number" ? lastRows[0].round : 0;
        }
        // 4) 自分の最新 round を確認（等幹ポイント1）
        const { data: myLastRows, error: myLastErr } = await supabase.from("dynamic_user_info").select("round").eq("tab_id", tab_id).order("created_at", {
            ascending: false
        }).limit(1);
        if (myLastErr) return json({
            ok: false,
            error: myLastErr.message ?? "DB select failed (dynamic_user_info my last)"
        }, 200);
        const myLast = myLastRows && myLastRows[0] && typeof myLastRows[0].round === "number" ? myLastRows[0].round : null;
        if (myLast !== null && myLast === roomMax && roomMax > 0) {
            return json({
                ok: true,
                round: roomMax
            }, 200);
        }
        // 5) 次のラウンド
        const nextRound = roomMax + 1;
        const host = N > 0 ? nextRound % N === n : false;
        // 二重挿入防止
        const { data: dupRows, error: dupErr } = await supabase.from("dynamic_user_info").select("id,round").eq("tab_id", tab_id).eq("round", nextRound).limit(1);
        if (dupErr) return json({
            ok: false,
            error: dupErr.message ?? "DB select failed (dup check)"
        }, 200);
        if (dupRows && dupRows.length > 0) {
            return json({
                ok: true,
                round: nextRound
            }, 200);
        }
        // 6) 挿入
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
   * - params: { txt: string, tab_id: string }
   * - dynamic_user_info で同じ tab_id の「最新1件」を探し、その行の input_QA を txt に更新
   * - 行が見つからなければ 404 を返す（通常は init-round が先に作成している想定）
   */ async "submit-topic"(params = {}) {
        const txt = String(params?.txt ?? "").trim();
        const tab_id = String(params?.tab_id ?? "").trim();
        if (!txt) return err("txt is required", 422);
        if (!tab_id) return err("tab_id is required", 422);
        // 対象行を取得（同 tab_id の最新1件）
        const { data: row, error: selErr } = await supabase.from("dynamic_user_info").select("id").eq("tab_id", tab_id).order("created_at", {
            ascending: false
        }).limit(1).maybeSingle();
        if (selErr) return err(selErr.message ?? "DB select failed", 500);
        if (!row?.id) return err("target row for this tab_id not found (call init-round first)", 404);
        // 更新
        const { data, error: updErr } = await supabase.from("dynamic_user_info").update({
            input_QA: txt
        }).eq("id", row.id).select().single();
        if (updErr) return err(updErr.message ?? "DB update failed", 500);
        return json({
            ok: true,
            row: data
        }, 200);
    },
    // 子: 回答を保存（従来どおり、必要があれば後で合わせて等幹化）
    async "submit-answer"(params = {}) {
        const txt = String(params?.txt ?? "").trim();
        const tab_id = String(params?.tab_id ?? "").trim();
        const user_name = String(params?.user_name ?? "").trim();
        if (!txt) return err("txt is required", 422);
        if (!tab_id) return err("tab_id is required", 422);
        if (!user_name) return err("user_name is required", 422);
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
            row: data
        }, 201);
    },
    // 子: お題が用意できたか？
    async "is-topic-ready"() {
        const { count, error } = await supabase.from("dynamic_user_info").select("id", {
            count: "exact",
            head: true
        }).eq("now_host", true).not("input_QA", "is", null);
        if (error) return err(error.message ?? "DB select failed", 500);
        return json({
            ok: true,
            ready: (count ?? 0) > 0
        }, 200);
    },
    // 現在のお題を取得
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
    // 子の回答一覧
    async "list-child-answers"() {
        const { data, error } = await supabase.from("dynamic_user_info").select("user_name,input_QA").eq("now_host", false).not("input_QA", "is", null).order("created_at", {
            ascending: true
        });
        if (error) return err(error.message ?? "DB select failed", 500);
        const answers = (data ?? []).filter((r) => typeof r.user_name === "string" && typeof r.input_QA === "string").map((r) => ({
            user_name: r.user_name,
            input_QA: r.input_QA
        }));
        return json({
            ok: true,
            answers
        }, 200);
    },
    // 親待機の判定
    async "are-children-answers-complete"() {
        const { count: readyCount, error: er1 } = await supabase.from("is_ready").select("id", {
            count: "exact",
            head: true
        });
        if (er1) return err(er1.message ?? "DB select failed (is_ready)", 500);
        let a = (readyCount ?? 0) - 1; // 親を除く
        if (a < 0) a = 0;
        const { count: childAnswered, error: er2 } = await supabase.from("dynamic_user_info").select("id", {
            count: "exact",
            head: true
        }).eq("now_host", false).not("input_QA", "is", null);
        if (er2) return err(er2.message ?? "DB select failed (dynamic_user_info)", 500);
        const b = childAnswered ?? 0;
        return json({
            ok: true,
            ready: a === b,
            a,
            b
        }, 200);
    },
    // 親の選択画面用：候補一覧
    async "list-parent-select-answers"() {
        const { data, error } = await supabase.from("dynamic_user_info").select("user_name,input_QA").eq("now_host", false).not("input_QA", "is", null).order("created_at", {
            ascending: true
        });
        if (error) return err(error.message ?? "DB select failed", 500);
        const answers = (data ?? []).filter((r) => typeof r.user_name === "string" && typeof r.input_QA === "string").map((r) => ({
            user_name: r.user_name,
            input_QA: r.input_QA
        }));
        return json({
            ok: true,
            answers
        }, 200);
    },
    // 親が選んだ回答を確定：total_pt + 1 & シグナル
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
