// supabase/functions/clever-handler/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";

// ---- CORS ----
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS"
};

const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

const err = (msg: string, status = 400) =>
    json({ ok: false, error: msg }, status);

// ---- Supabase Admin Client ----
const url = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !serviceKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

// ---- Utils ----
async function readJson(req: Request) {
    const ctype = req.headers.get("content-type") ?? "";
    if (!ctype.toLowerCase().includes("application/json")) return null;
    try {
        return await req.json();
    } catch {
        return null;
    }
}

// ===== ハンドラ群 =====
const handlers: Record<string, (params?: any) => Promise<Response>> = {
    // 親: お題を保存
    async "submit-topic"(params = {}) {
        const txt = String(params?.txt ?? "").trim();
        const tab_id = String(params?.tab_id ?? "").trim();
        const user_name = String(params?.user_name ?? "").trim();
        if (!txt) return err("txt is required", 422);
        if (!tab_id) return err("tab_id is required", 422);
        if (!user_name) return err("user_name is required", 422);

        const id = crypto.randomUUID();
        const payload = {
            id,
            tab_id,
            user_name,
            now_host: true,
            already_host: false,
            input_QA: txt,
            vote_to: null,
            round: 1
        };

        const { data, error } = await supabase
            .from("dynamic_user_info")
            .insert([payload])
            .select()
            .single();

        if (error) return err(error.message ?? "DB insert failed", 500);
        return json({ ok: true, row: data }, 201);
    },

    // 子: 回答を保存
    async "submit-answer"(params = {}) {
        const txt = String(params?.txt ?? "").trim();
        const tab_id = String(params?.tab_id ?? "").trim();
        const user_name = String(params?.user_name ?? "").trim();
        if (!txt) return err("txt is required", 422);
        if (!tab_id) return err("tab_id is required", 422);
        if (!user_name) return err("user_name is required", 422);

        const id = crypto.randomUUID();
        const payload = {
            id,
            tab_id,
            user_name,
            now_host: false,
            already_host: false,
            input_QA: txt,
            vote_to: null,
            round: 1
        };

        const { data, error } = await supabase
            .from("dynamic_user_info")
            .insert([payload])
            .select()
            .single();

        if (error) return err(error.message ?? "DB insert failed", 500);
        return json({ ok: true, row: data }, 201);
    },

    // 子: お題が用意できたか？
    async "is-topic-ready"() {
        const { count, error } = await supabase
            .from("dynamic_user_info")
            .select("id", { count: "exact", head: true })
            .eq("now_host", true)
            .not("input_QA", "is", null);

        if (error) return err(error.message ?? "DB select failed", 500);
        const ready = (count ?? 0) > 0;
        return json({ ok: true, ready }, 200);
    },

    // 現在のお題を取得
    async "get-current-topic"() {
        const { data, error } = await supabase
            .from("dynamic_user_info")
            .select("input_QA")
            .eq("now_host", true)
            .not("input_QA", "is", null)
            .order("created_at", { ascending: false })
            .limit(1);

        if (error) return err(error.message ?? "DB select failed", 500);
        const topic = data && data.length > 0 ? data[0].input_QA : "";
        return json({ ok: true, topic }, 200);
    },

    // 子の回答一覧
    async "list-child-answers"() {
        const { data, error } = await supabase
            .from("dynamic_user_info")
            .select("user_name,input_QA")
            .eq("now_host", false)
            .not("input_QA", "is", null)
            .order("created_at", { ascending: true });

        if (error) return err(error.message ?? "DB select failed", 500);

        const answers =
            (data ?? [])
                .filter((r: any) => typeof r.user_name === "string" && typeof r.input_QA === "string")
                .map((r: any) => ({ user_name: r.user_name, input_QA: r.input_QA }));

        return json({ ok: true, answers }, 200);
    },

    // 親待機の判定：全子回答が揃ったか？
    async "are-children-answers-complete"() {
        const { count: readyCount, error: er1 } = await supabase
            .from("is_ready")
            .select("id", { count: "exact", head: true });

        if (er1) return err(er1.message ?? "DB select failed (is_ready)", 500);

        let a = (readyCount ?? 0) - 1; // 親を除く
        if (a < 0) a = 0;

        const { count: childAnswered, error: er2 } = await supabase
            .from("dynamic_user_info")
            .select("id", { count: "exact", head: true })
            .eq("now_host", false)
            .not("input_QA", "is", null);

        if (er2) return err(er2.message ?? "DB select failed (dynamic_user_info)", 500);

        const b = childAnswered ?? 0;
        const ready = a === b;
        return json({ ok: true, ready, a, b }, 200);
    },

    // 親の選択画面用：候補一覧
    async "list-parent-select-answers"() {
        const { data, error } = await supabase
            .from("dynamic_user_info")
            .select("user_name,input_QA")
            .eq("now_host", false)
            .not("input_QA", "is", null)
            .order("created_at", { ascending: true });

        if (error) return err(error.message ?? "DB select failed", 500);

        const answers =
            (data ?? [])
                .filter((r: any) => typeof r.user_name === "string" && typeof r.input_QA === "string")
                .map((r: any) => ({ user_name: r.user_name, input_QA: r.input_QA }));

        return json({ ok: true, answers }, 200);
    },

    // 親が選んだ回答を確定：total_pt + 1 & シグナル（vote_to='SELECTED'）
    async "mark-selected-answer"(params = {}) {
        const user_name = String(params?.user_name ?? "").trim();
        const input_QA = String(params?.input_QA ?? "").trim();
        const round = Number(params?.round ?? 1) || 1;

        if (!user_name) return err("user_name is required", 422);
        if (!input_QA) return err("input_QA is required", 422);

        // 対象行を取得
        const { data: rows, error: selErr } = await supabase
            .from("dynamic_user_info")
            .select("id,total_pt")
            .eq("user_name", user_name)
            .eq("input_QA", input_QA)
            .eq("now_host", false)
            .eq("round", round)
            .limit(1);

        if (selErr) return err(selErr.message ?? "DB select failed", 500);
        if (!rows || rows.length === 0) return err("target row not found", 404);

        const targetId = rows[0].id;
        const nextPt = (rows[0].total_pt ?? 0) + 1;

        const { error: updErr } = await supabase
            .from("dynamic_user_info")
            .update({ total_pt: nextPt, vote_to: "SELECTED" }) // vote_to をシグナルに流用
            .eq("id", targetId);

        if (updErr) return err(updErr.message ?? "DB update failed", 500);
        return json({ ok: true }, 200);
    },

    // 選出済みか？（子画面が /selectedanswer に遷移するかの判定）
    async "is-selection-decided"() {
        const { count, error } = await supabase
            .from("dynamic_user_info")
            .select("id", { count: "exact", head: true })
            .eq("vote_to", "SELECTED"); // 必要なら .eq("round", 1) や .eq("tab_id", ...) を追加

        if (error) return err(error.message ?? "DB select failed", 500);
        const decided = (count ?? 0) > 0;
        return json({ ok: true, decided }, 200);
    },

    // ★ 最も total_pt が高い（NULLは最小扱い）1件を best、それ以外を others として返す
    async "get-selected-answer"(params = {}) {
        // 任意: ラウンドやタブで絞る
        const roundParam = params?.round;
        const tabId = String(params?.tab_id ?? "").trim();

        let q = supabase
            .from("dynamic_user_info")
            .select("id,user_name,input_QA,total_pt,created_at,tab_id,round,now_host")
            .eq("now_host", false)
            .not("input_QA", "is", null);

        if (roundParam !== undefined && roundParam !== null && !Number.isNaN(Number(roundParam))) {
            q = q.eq("round", Number(roundParam));
        }
        if (tabId) {
            q = q.eq("tab_id", tabId);
        }

        // NULL を最小として最後に送り、非NULLの降順→作成日時昇順
        const { data, error } = await q
            .order("total_pt", { ascending: false, nullsFirst: false })
            .order("created_at", { ascending: true });

        if (error) return err(error.message ?? "DB select failed", 500);

        if (!data || data.length === 0) {
            return json({ ok: true, best: null, others: [] }, 200);
        }

        // 非NULL の最初の行が「最大 total_pt」
        const idx = data.findIndex((r: any) => r.total_pt !== null && r.total_pt !== undefined);

        if (idx === -1) {
            // 全件 total_pt が NULL の場合は best を立てない（必要なら最古を best にするなどへ変更可）
            const othersAll = data.map((r: any) => ({
                user_name: r.user_name,
                input_QA: r.input_QA,
                total_pt: r.total_pt
            }));
            return json({ ok: true, best: null, others: othersAll }, 200);
        }

        const bestRow = data[idx];
        const best = {
            user_name: bestRow.user_name,
            input_QA: bestRow.input_QA,
            total_pt: bestRow.total_pt
        };

        const others = data
            .filter((_: any, i: number) => i !== idx)
            .map((r: any) => ({
                user_name: r.user_name,
                input_QA: r.input_QA,
                total_pt: r.total_pt
            }));

        return json({ ok: true, best, others }, 200);
    }
};

// ===== エントリポイント =====
Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
        return err("Method Not Allowed", 405);
    }
    const body = await readJson(req);
    if (!body) return err("Invalid JSON body", 400);

    const method = body["method"] ?? body["action"] ?? "";
    const handler = (handlers as any)[method];
    if (!handler) return err(`Unknown method: ${method}`, 400);

    const params = body["params"] ?? body;
    return handler(params);
});
