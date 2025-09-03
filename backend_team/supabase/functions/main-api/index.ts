// supabase/functions/main-api/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";
/** ---------------- CORS & helpers ---------------- **/ const corsHeaders = {
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
const err = (msg, status = 400, extra = {}) => json({
    ok: false,
    error: msg,
    ...extra
}, status);
/** --------------- server start log --------------- **/ console.info("main-api: server started (service-role + CORS)");
/** --------------- entrypoint --------------- **/ Deno.serve(async (req) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", {
            headers: corsHeaders
        });
    }
    if (req.method !== "POST") return err("Method Not Allowed", 405);
    // parse body
    let body;
    try {
        body = await req.json();
    } catch {
        return err("Invalid JSON body", 400);
    }
    const action = String(body.action ?? body.method ?? "").trim();
    // Service Role client
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return err("Env not set: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY", 500);
    const supabase = createClient(url, serviceKey, {
        auth: {
            persistSession: false
        }
    });
    // params helper
    const pickParam = (key) => body?.params?.[key] ?? body?.[key];
  /** save-user */ if (action === "save-user") {
        const user_name = String(pickParam("user_name") ?? "").trim();
        const tab_id = String(pickParam("tab_id") ?? "").trim();
        const room_name = String(pickParam("room_name") ?? "").trim();
        if (!user_name || !tab_id || !room_name) {
            return json({
                ok: false,
                error: "user_name/tab_id/room_name are required"
            }, 200);
        }
        const { data, error } = await supabase.from("user_log").insert({
            user_name,
            tab_id,
            room_name
        }).select().single();
        if (error) {
            console.error("insert user_log error:", error);
            return json({
                ok: false,
                error: error.message
            }, 200);
        }
        return json({
            ok: true,
            row: data
        }, 201);
    }
  /** join-room */ if (action === "join-room") {
        const user_name = String(pickParam("user_name") ?? "").trim();
        const tab_id = String(pickParam("tab_id") ?? "").trim();
        const room_name = String(pickParam("room_name") ?? "").trim();
        if (!user_name || !tab_id || !room_name) {
            return json({
                ok: false,
                error: "user_name/tab_id/room_name are required"
            }, 200);
        }
        const { data: logRow, error: logErr } = await supabase.from("user_log").insert({
            tab_id,
            room_name,
            user_name
        }).select().single();
        if (logErr) return json({
            ok: false,
            error: logErr.message
        }, 200);
        const { data: latest, error: selErr } = await supabase.from("room_info_TEMP").select("id, num_of_nowusers").eq("room_name", room_name).order("created_at", {
            ascending: false
        }).limit(1).maybeSingle();
        if (selErr) {
            return json({
                ok: true,
                row: logRow,
                room_update_error: selErr.message
            }, 201);
        }
        if (!latest) {
            return json({
                ok: true,
                row: logRow,
                room_update_skipped: true
            }, 201);
        }
        const next = (typeof latest.num_of_nowusers === "number" ? latest.num_of_nowusers : 0) + 1;
        const { data: updatedRoom, error: updErr } = await supabase.from("room_info_TEMP").update({
            num_of_nowusers: next
        }).eq("id", latest.id).select().single();
        if (updErr) {
            return json({
                ok: true,
                row: logRow,
                room_update_error: updErr.message
            }, 201);
        }
        return json({
            ok: true,
            row: logRow,
            room: updatedRoom
        }, 201);
    }
  /** get-round
   * 入力: tab_id
   * 処理: user_log から tab_id 一致の最新1件を取り、その round を返す
   * 見つからない/値が無い場合は round=0 を返す
   */ if (action === "get-round") {
        const tab_id = String(pickParam("tab_id") ?? "").trim();
        if (!tab_id) return json({
            ok: false,
            error: "tab_id is required"
        }, 200);
        const { data: row, error } = await supabase.from("user_log").select("round, created_at").eq("tab_id", tab_id).order("created_at", {
            ascending: false
        }).limit(1).maybeSingle();
        if (error) return json({
            ok: false,
            error: error.message
        }, 200);
        const round = typeof row?.round === "number" && Number.isFinite(row.round) ? row.round : 0;
        return json({
            ok: true,
            round
        }, 200);
    }
  /** submit-topic（user_log） */ if (action === "submit-topic") {
        const txt = String(pickParam("txt") ?? "").trim();
        const tab_id = String(pickParam("tab_id") ?? "").trim();
        if (!txt) return json({
            ok: false,
            error: "txt is required"
        }, 200);
        if (!tab_id) return json({
            ok: false,
            error: "tab_id is required"
        }, 200);
        const { data: row, error: selErr } = await supabase.from("user_log").select("id").eq("tab_id", tab_id).order("created_at", {
            ascending: false
        }).limit(1).maybeSingle();
        if (selErr) return json({
            ok: false,
            error: selErr.message
        }, 200);
        if (!row?.id) {
            return json({
                ok: false,
                error: "target row for this tab_id not found (insert user_log first)"
            }, 200);
        }
        const { data, error: updErr } = await supabase.from("user_log").update({
            input_QA: txt
        }).eq("id", row.id).select().single();
        if (updErr) return json({
            ok: false,
            error: updErr.message
        }, 200);
        return json({
            ok: true,
            row: data
        }, 200);
    }
  /** get-current-topic（user_log ベース）
   * 入力: { tab_id }
   *  1) user_log から tab_id 最新1件 → room_name, round 取得
   *  2) 同 room & round で now_host=true, input_QA not null の最新1件を取得
   *  3) あればその input_QA を topic として返す
   */ if (action === "get-current-topic") {
        const tab_id = String(pickParam("tab_id") ?? "").trim();
        if (!tab_id) return json({
            ok: false,
            error: "tab_id is required"
        }, 200);
        const { data: me, error: meErr } = await supabase.from("user_log").select("room_name, round, created_at").eq("tab_id", tab_id).order("created_at", {
            ascending: false
        }).limit(1).maybeSingle();
        if (meErr) return json({
            ok: false,
            error: meErr.message
        }, 200);
        const room_name = me?.room_name ?? null;
        const round = typeof me?.round === "number" && Number.isFinite(me.round) ? me.round : null;
        if (!room_name || round === null) {
            return json({
                ok: true,
                topic: null
            }, 200);
        }
        const { data: hostRow, error: hostErr } = await supabase.from("user_log").select("input_QA, created_at").eq("room_name", room_name).eq("round", round).eq("now_host", true).not("input_QA", "is", null).order("created_at", {
            ascending: false
        }).limit(1).maybeSingle();
        if (hostErr) return json({
            ok: false,
            error: hostErr.message
        }, 200);
        const topic = typeof hostRow?.input_QA === "string" ? hostRow.input_QA : null;
        return json({
            ok: true,
            topic
        }, 200);
    }
  /** submit-answer（user_log の最新1件を更新）
   * 入力: { tab_id, txt }
   *  1) user_log を tab_id で最新1件検索（id を取得）
   *  2) その行の input_QA を txt に UPDATE
   * 返却: { ok:true, row:<更新後>, updated:true }
   */ if (action === "submit-answer") {
        const tab_id = String(pickParam("tab_id") ?? "").trim();
        const txt = String(pickParam("txt") ?? "").trim();
        if (!tab_id) return json({
            ok: false,
            error: "tab_id is required"
        }, 200);
        if (!txt) return json({
            ok: false,
            error: "txt is required"
        }, 200);
        const { data: latest, error: selErr } = await supabase.from("user_log").select("id").eq("tab_id", tab_id).order("created_at", {
            ascending: false
        }).limit(1).maybeSingle();
        if (selErr) return json({
            ok: false,
            error: selErr.message
        }, 200);
        if (!latest?.id) {
            return json({
                ok: false,
                error: "target row for this tab_id not found"
            }, 200);
        }
        const { data, error: updErr } = await supabase.from("user_log").update({
            input_QA: txt
        }).eq("id", latest.id).select().single();
        if (updErr) return json({
            ok: false,
            error: updErr.message
        }, 200);
        return json({
            ok: true,
            row: data,
            updated: true
        }, 200);
    }
  /** ---------- ★ 追加: list-parent-select-answers ----------
   * 入力: { tab_id }
   * 手順:
   *  1) user_log から tab_id 一致の最新1件を取得 → room_name, round を得る
   *  2) user_log を room_name & round 一致, now_host=false, input_QA not null で検索
   *  3) 取得した行を { user_name, input_QA } の配列に整形して返す
   * 返却: { ok:true, answers: Array<{ user_name:string, input_QA:string }> }
   */ if (action === "list-parent-select-answers") {
        const tab_id = String(pickParam("tab_id") ?? "").trim();
        if (!tab_id) return json({
            ok: false,
            error: "tab_id is required"
        }, 200);
        const { data: meRow, error: meErr } = await supabase.from("user_log").select("room_name, round, created_at").eq("tab_id", tab_id).order("created_at", {
            ascending: false
        }).limit(1).maybeSingle();
        if (meErr) return json({
            ok: false,
            error: meErr.message
        }, 200);
        const room_name = typeof meRow?.room_name === "string" ? meRow.room_name : null;
        const round = typeof meRow?.round === "number" && Number.isFinite(meRow.round) ? meRow.round : null;
        if (!room_name || round === null) {
            return json({
                ok: true,
                answers: []
            }, 200);
        }
        const { data, error } = await supabase.from("user_log").select("user_name, input_QA").eq("room_name", room_name).eq("round", round).eq("now_host", false).not("input_QA", "is", null).order("created_at", {
            ascending: true
        });
        if (error) return json({
            ok: false,
            error: error.message
        }, 200);
        const answers = (data ?? []).filter((r) => typeof r.user_name === "string" && typeof r.input_QA === "string").map((r) => ({
            user_name: r.user_name,
            input_QA: r.input_QA
        })) ?? [];
        return json({
            ok: true,
            answers
        }, 200);
    }
  /** ---------- ★ 追加: mark-selected-answer ----------
   * 入力: { user_name, input_QA, round }
   * 処理:
   *  user_log を user_name, input_QA, round, now_host=false で 1件特定し、
   *  total_pt を +1, vote_to='SELECTED' に更新
   * 返却: { ok:true }
   */ if (action === "mark-selected-answer") {
        const user_name = String(pickParam("user_name") ?? "").trim();
        const input_QA = String(pickParam("input_QA") ?? "").trim();
        const round = Number(pickParam("round") ?? NaN);
        if (!user_name) return json({
            ok: false,
            error: "user_name is required"
        }, 200);
        if (!input_QA) return json({
            ok: false,
            error: "input_QA is required"
        }, 200);
        if (!Number.isFinite(round)) return json({
            ok: false,
            error: "round is required"
        }, 200);
        const { data: rows, error: selErr } = await supabase.from("user_log").select("id, total_pt").eq("user_name", user_name).eq("input_QA", input_QA).eq("now_host", false).eq("round", round).limit(1);
        if (selErr) return json({
            ok: false,
            error: selErr.message
        }, 200);
        if (!rows || rows.length === 0) return json({
            ok: false,
            error: "target row not found"
        }, 200);
        const targetId = rows[0].id;
        const nextPt = (rows[0].total_pt ?? 0) + 1;
        const { error: updErr } = await supabase.from("user_log").update({
            total_pt: nextPt,
            vote_to: "SELECTED"
        }).eq("id", targetId);
        if (updErr) return json({
            ok: false,
            error: updErr.message
        }, 200);
        return json({
            ok: true
        }, 200);
    }
  /** ---------- ★ 追加: get-selected-answer ----------
   * 入力: { tab_id }
   * 手順:
   *  1) user_log を tab_id で最新1件取得 → room_name, round を得る
   *  2) 同じ room_name & round の集合に対して、
   *     - best : now_host=false & vote_to='SELECTED' を created_at DESC で1件
   *     - others: now_host=false & vote_to IS NULL の一覧（created_at ASC）
   * 返却: { ok:true, best: {user_name,input_QA}|null, others: Array<{user_name,input_QA}> }
   */ if (action === "get-selected-answer") {
        const tab_id = String(pickParam("tab_id") ?? "").trim();
        if (!tab_id) return json({
            ok: false,
            error: "tab_id is required"
        }, 200);
        // 1) 自タブ最新 → room_name, round
        const { data: meRow, error: meErr } = await supabase.from("user_log").select("room_name, round, created_at").eq("tab_id", tab_id).order("created_at", {
            ascending: false
        }).limit(1).maybeSingle();
        if (meErr) return json({
            ok: false,
            error: meErr.message
        }, 200);
        const room_name = typeof meRow?.room_name === "string" ? meRow.room_name : null;
        const round = typeof meRow?.round === "number" && Number.isFinite(meRow.round) ? meRow.round : null;
        if (!room_name || round === null) {
            return json({
                ok: true,
                best: null,
                others: []
            }, 200);
        }
        // 2-a) best: SELECTED の中から最新1件
        const { data: bestRow, error: bestErr } = await supabase.from("user_log").select("user_name, input_QA, created_at").eq("room_name", room_name).eq("round", round).eq("now_host", false).eq("vote_to", "SELECTED").order("created_at", {
            ascending: false
        }).limit(1).maybeSingle();
        if (bestErr) return json({
            ok: false,
            error: bestErr.message
        }, 200);
        // 2-b) others: vote_to が NULL の一覧
        const { data: othersRows, error: othersErr } = await supabase.from("user_log").select("user_name, input_QA, created_at").eq("room_name", room_name).eq("round", round).eq("now_host", false).is("vote_to", null).order("created_at", {
            ascending: true
        });
        if (othersErr) return json({
            ok: false,
            error: othersErr.message
        }, 200);
        const best = typeof bestRow?.user_name === "string" && typeof bestRow?.input_QA === "string" ? {
            user_name: bestRow.user_name,
            input_QA: bestRow.input_QA
        } : null;
        const others = (othersRows ?? []).filter((r) => typeof r.user_name === "string" && typeof r.input_QA === "string").map((r) => ({
            user_name: r.user_name,
            input_QA: r.input_QA
        })) ?? [];
        return json({
            ok: true,
            best,
            others
        }, 200);
    }
    return err("Unknown action", 400);
});