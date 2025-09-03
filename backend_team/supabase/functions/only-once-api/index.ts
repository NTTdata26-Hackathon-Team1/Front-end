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
    // 未定義 action
    return err("Unknown action", 400);
});
