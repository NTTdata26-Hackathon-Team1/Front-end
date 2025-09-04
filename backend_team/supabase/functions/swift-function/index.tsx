// supabase/functions/swift-function/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";
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
console.info("swift-function: server started (service-role + CORS)");
Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", {
        headers: corsHeaders
    });
    if (req.method !== "POST") return err("Method Not Allowed", 405);
    let body;
    try {
        body = await req.json();
    } catch {
        return err("Invalid JSON body", 400);
    }
    const action = body.action ?? body["method"] ?? "";
    // Service Role
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return err("Env not set: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY", 500);
    const supabase = createClient(url, serviceKey, {
        auth: {
            persistSession: false
        }
    });
    // ---- create-room ----
    if (action === "create-room") {
        const nickname = String(body.nickname ?? "").trim();
        const roomName = String(body.room_name ?? "").trim();
        const rounds = Number(body.round_count);
        const players = Number(body.player_count);
        if (!nickname) return err("nickname is required", 422);
        if (!roomName) return err("room_name is required", 422);
        if (!Number.isInteger(rounds) || rounds <= 0) return err("round_count must be positive integer", 422);
        if (!Number.isInteger(players) || players <= 0) return err("player_count must be positive integer", 422);
        const { data, error } = await supabase.from("room_info").insert({
            maker: nickname,
            name: roomName,
            num_of_r: rounds,
            num_of_u: players
        }).select().single();
        if (error) {
            console.error("insert room_info error:", error);
            return err("failed to insert room_info", 400, {
                code: error.code ?? null,
                details: error.details ?? error.message,
                hint: error.hint ?? null
            });
        }
        return json({
            ok: true,
            room: data,
            room_id: data?.id ?? null
        }, 201);
    }
    // ---- list-rooms（30分以内の name と num_of_s の最新を返す）----
    if (action === "list-rooms") {
        const sinceIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data, error } = await supabase.from("room_info").select("name, num_of_s, created_at").gte("created_at", sinceIso).order("created_at", {
            ascending: false
        });
        if (error) {
            console.error("select room_info error:", error);
            return err("failed to fetch room list", 500, {
                code: error.code ?? null,
                details: error.details ?? error.message,
                hint: error.hint ?? null
            });
        }
        // 同名は最新のみ
        const latestByName = new Map();
        for (const row of data ?? []) {
            const n = String(row.name ?? "");
            if (!n || latestByName.has(n)) continue;
            latestByName.set(n, {
                name: n,
                num_of_s: row.num_of_s ?? null
            });
        }
        const rooms = Array.from(latestByName.values());
        return json({
            ok: true,
            rooms
        }, 200);
    }
    // ---- join-room（name一致の最新レコードの num_of_s を +1）----
    if (action === "join-room") {
        const roomName = String(body.room_name ?? "").trim();
        if (!roomName) return err("room_name is required", 422);
        // 最新行を取得
        const { data: latest, error: selErr } = await supabase.from("room_info").select("id, num_of_s").eq("name", roomName).order("created_at", {
            ascending: false
        }).limit(1).single();
        if (selErr) return err(selErr.message ?? "room not found", 404);
        const current = latest?.num_of_s ?? 0;
        const next = current + 1;
        const { data: updated, error: updErr } = await supabase.from("room_info").update({
            num_of_s: next
        }).eq("id", latest.id).select().single();
        if (updErr) return err(updErr.message ?? "failed to update num_of_s", 500);
        return json({
            ok: true,
            room: updated,
            room_name: roomName,
            num_of_s: next
        }, 200);
    }
    return err("Unknown action", 400);
});
