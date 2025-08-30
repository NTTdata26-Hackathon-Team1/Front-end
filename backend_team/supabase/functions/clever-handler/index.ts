// supabase/functions/clever-handler/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";

// ---- CORS ----
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
const err = (msg: string, status = 400) => json({ ok: false, error: msg }, status);

// ---- Supabase Admin Client ----
const url = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !serviceKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

// ---- Utils ----
async function readJson<T = unknown>(req: Request): Promise<T | null> {
    const ctype = req.headers.get("content-type") ?? "";
    if (!ctype.toLowerCase().includes("application/json")) return null;
    try {
        return (await req.json()) as T;
    } catch {
        return null;
    }
}

// ===== ハンドラ群 =====
const handlers: Record<string, (params?: Record<string, unknown>) => Promise<Response>> = {
    /**
     * 親: お題を保存
     * params: { txt: string, tab_id: string, user_name: string }
     * 挙動: dynamic_user_info に行を挿入
     */
    async "submit-topic"(params = {}) {
        const txt = String(params?.txt ?? "").trim();
        const tab_id = String(params?.tab_id ?? "").trim();
        const user_name = String(params?.user_name ?? "").trim();

        if (!txt) return err("txt is required", 422);
        if (!tab_id) return err("tab_id is required", 422);
        if (!user_name) return err("user_name is required", 422);

        // ★ id を自前発行（DB に default gen_random_uuid() が無くても動く）
        const id = crypto.randomUUID();

        const payload = {
            id,                // uuid PK
            tab_id,            // text
            user_name,         // text
            now_host: true,    // bool
            already_host: false, // bool
            input_QA: txt,     // text
            vote_to: null as string | null, // text (NULLのまま)
            round: 1,          // int2
            // created_at は DB 側 default now() 推奨。無い場合は以下を使う：
            // created_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
            .from("dynamic_user_info")
            .insert([payload])
            .select()
            .single();

        if (error) return err(error.message ?? "DB insert failed", 500);
        return json({ ok: true, row: data }, 201);
    },

    /**
     * 子: お題が用意できたか？
     * params: なし
     * 挙動: dynamic_user_info に now_host = true かつ input_QA が NOT NULL な行が存在するかを返す
     */
    async "is-topic-ready"() {
        // 存在確認だけなので head + count で軽量に
        const { count, error } = await supabase
            .from("dynamic_user_info")
            .select("id", { count: "exact", head: true })
            .eq("now_host", true)
            .not("input_QA", "is", null);

        if (error) return err(error.message ?? "DB select failed", 500);
        const ready = (count ?? 0) > 0;
        return json({ ok: true, ready }, 200);
    },
};

// ===== エントリポイント =====
Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
        return err("Method Not Allowed", 405);
    }

    const body = await readJson<Record<string, unknown>>(req);
    if (!body) return err("Invalid JSON body", 400);

    // method ルーティング（action でも可）
    const method =
        (body["method"] as string) ??
        (body["action"] as string) ??
        "";

    const handler = handlers[method];
    if (!handler) return err(`Unknown method: ${method}`, 400);

    // params でもフラットでも受けられるように
    const params = (body["params"] as Record<string, unknown>) ?? body;
    return handler(params);
});
