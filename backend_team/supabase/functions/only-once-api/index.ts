// supabase/functions/only-once-api/index.ts
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
const err = (msg, status = 400, extra = {}) => json({
    ok: false,
    error: msg,
    ...extra
}, status);
console.info("only-once-api: server started (service-role + CORS)");
Deno.serve(async (req) => {
    // Preflight
    if (req.method === "OPTIONS") return new Response("ok", {
        headers: corsHeaders
    });
    if (req.method !== "POST") return err("Method Not Allowed", 405);
    // Parse body
    let body;
    try {
        body = await req.json();
    } catch {
        return err("Invalid JSON body", 400);
    }
    const action = body.action ?? body["method"] ?? "";
    // Service Role client
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) {
        return err("Env not set: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY", 500);
    }
    const supabase = createClient(url, serviceKey, {
        auth: {
            persistSession: false
        }
    });
    // ---- create-room ----
    if (action === "create-room") {
        const user_name = String(body.user_name ?? "").trim();
        const room_name = String(body.room_name ?? "").trim();
        const num_of_rounds = Number(body.num_of_rounds);
        const num_of_totalusers = Number(body.num_of_totalusers);
        const tab_id = typeof body.tab_id === "string" ? body.tab_id.trim() : "";
        // Validation
        if (!user_name) return err("user_name is required", 422);
        if (!room_name) return err("room_name is required", 422);
        if (!Number.isInteger(num_of_rounds) || num_of_rounds <= 0) return err("num_of_rounds must be positive integer", 422);
        if (!Number.isInteger(num_of_totalusers) || num_of_totalusers <= 0) return err("num_of_totalusers must be positive integer", 422);
        // room_info_TEMP へ作成（作成者が入室済みとして num_of_nowusers=1）
        const { data: room, error: roomErr } = await supabase.from("room_info_TEMP").insert({
            made_by: user_name,
            room_name,
            num_of_rounds,
            num_of_nowusers: 1,
            num_of_totalusers
        }).select().single();
        if (roomErr) {
            console.error("insert room_info_TEMP error:", roomErr);
            return err("failed to insert room_info_TEMP", 400, {
                code: roomErr?.code ?? null,
                details: roomErr?.details ?? roomErr?.message,
                hint: roomErr?.hint ?? null
            });
        }
        // 可能なら user_log にも1行追加（tab_id が渡ってこない場合はスキップ）
        let userLogRow = null;
        let userLogError = null;
        if (tab_id) {
            const { data: log, error: logErr } = await supabase.from("user_log").insert({
                tab_id,
                room_name,
                user_name
            }).select().single();
            if (logErr) {
                console.warn("insert user_log error (create-room, optional):", logErr);
                userLogError = logErr.message ?? "failed to insert user_log";
            } else {
                userLogRow = log;
            }
        }
        return json({
            ok: true,
            room,
            room_id: room?.id ?? null,
            user_log_row: userLogRow,
            user_log_error: userLogError
        }, 201);
    }
    // ---- mark-ready（新仕様）----
    // tab_id を受け取り、user_log の該当行（同じ tab_id の全行）の ready を TRUE に更新
    if (action === "mark-ready") {
        const tab_id = String(body.tab_id ?? body?.params?.tab_id ?? "").trim();
        if (!tab_id) return err("tab_id is required", 422);
        const { data, error } = await supabase.from("user_log").update({
            ready: true
        }).eq("tab_id", tab_id).select(); // 更新後の行を返す（件数把握兼ねる）
        if (error) {
            console.error("update user_log.ready error:", error);
            return err("failed to update user_log", 400, {
                code: error?.code ?? null,
                details: error?.details ?? error?.message,
                hint: error?.hint ?? null
            });
        }
        return json({
            ok: true,
            updated_rows: Array.isArray(data) ? data.length : 0
        }, 200);
    }
    // ---- get-result（新規追加）----
    // 仕様:
    // 1) 入力 tab_id の全行 total_pt 合計を出す
    // 2) 入力 tab_id の最新行から room_name を取得
    // 3) その room_name の全行を取得し、tab_id ごとに total_pt を合計 + 代表 user_name（最新の非 null）
    // 4) 合計値で降順ソートし、上位3件を { rank, user_name, pt } で返す
    if (action === "get-result") {
        const tab_id = String(body.tab_id ?? body?.params?.tab_id ?? "").trim();
        if (!tab_id) return err("tab_id is required", 422);
        // (A) 自分の合計 total_pt（参考: 必須ではないが取得しておく）
        const { data: myRows, error: myErr } = await supabase.from("user_log").select("user_name, total_pt, created_at").eq("tab_id", tab_id);
        if (myErr) {
            console.error("select user_log by tab_id error:", myErr);
            return err("failed to fetch user_log by tab_id", 500, {
                code: myErr?.code ?? null,
                details: myErr?.details ?? myErr?.message,
                hint: myErr?.hint ?? null
            });
        }
        const sumTotalPt = (rows) => rows?.map((r) => typeof r?.total_pt === "number" ? r.total_pt : Number(r?.total_pt) || 0)?.reduce((a, b) => a + b, 0) ?? 0;
        const myTotal = sumTotalPt(myRows ?? []);
        // 最新の user_name を控える（null 時は undefined）
        const myLatestName = (myRows ?? []).filter((r) => typeof r?.user_name === "string" && r.user_name.trim()).sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())[0]?.user_name ?? undefined;
        // (B) 入力 tab_id の最新行 → room_name を取得
        const { data: latestRow, error: latestErr } = await supabase.from("user_log").select("room_name, created_at").eq("tab_id", tab_id).order("created_at", {
            ascending: false
        }).limit(1).maybeSingle();
        if (latestErr) {
            console.error("fetch latest user_log error:", latestErr);
            return err("failed to fetch latest user_log", 500, {
                code: latestErr?.code ?? null,
                details: latestErr?.details ?? latestErr?.message,
                hint: latestErr?.hint ?? null
            });
        }
        const room_name = latestRow?.room_name;
        if (typeof room_name !== "string" || !room_name.trim()) {
            return err("room_name is not determined for this tab_id", 422);
        }
        // (C) 同 room_name の全行を取得（tab_id ごとに合計するため一括取得）
        const { data: roomRows, error: roomErr } = await supabase.from("user_log").select("tab_id, user_name, total_pt, created_at").eq("room_name", room_name);
        if (roomErr) {
            console.error("select user_log by room_name error:", roomErr);
            return err("failed to fetch user_log by room_name", 500, {
                code: roomErr?.code ?? null,
                details: roomErr?.details ?? roomErr?.message,
                hint: roomErr?.hint ?? null
            });
        }
        const aggByTab = new Map();
        for (const r of roomRows ?? []) {
            const t = String(r?.tab_id ?? "").trim();
            if (!t) continue;
            const pt = typeof r?.total_pt === "number" ? r.total_pt : Number(r?.total_pt) || 0;
            const ts = new Date(r?.created_at ?? 0).getTime();
            const prev = aggByTab.get(t) ?? {
                sumPt: 0,
                latestName: undefined,
                latestTs: -1
            };
            const next = {
                ...prev,
                sumPt: prev.sumPt + pt
            };
            const nm = typeof r?.user_name === "string" ? r.user_name.trim() : "";
            if (nm && ts >= prev.latestTs) {
                next.latestName = nm;
                next.latestTs = ts;
            }
            aggByTab.set(t, next);
        }
        // (E) ランキング配列に変換
        const entries = Array.from(aggByTab.entries()).map(([tid, v]) => ({
            tab_id: tid,
            user_name: v.latestName ?? (tid === tab_id && typeof myLatestName === "string" ? myLatestName : "unknown"),
            pt: v.sumPt
        }));
        // 合計で降順 → 上位3
        entries.sort((a, b) => b.pt - a.pt);
        const top3 = entries.slice(0, 3).map((e, i) => ({
            rank: i + 1,
            user_name: e.user_name,
            pt: e.pt
        }));
        return json({
            ok: true,
            results: top3
        }, 200);
    }
    // 未定義 action
    return err("Unknown action", 400);
});
