import { corsHeaders, handleCorsOptions } from "./cors.ts";
import { fetchRecentUsernames } from "./recentUsers.ts";
import { insertUserRow, pushMessageToTab } from "./writers.ts";
import { supabaseAdmin } from "./supabaseAdmin.ts"; // ★ 追加：is_ready を読むため

/** 便利レスポンダ */
function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}
function errorJson(message: string, status = 400) {
    return json({ error: message }, status);
}

/** JSON を安全に読む（空ボディ・非JSONにも耐える） */
async function readJson<T = unknown>(req: Request): Promise<T | null> {
    const ctype = req.headers.get("content-type") ?? "";
    if (!ctype.toLowerCase().includes("application/json")) return null;
    try {
        return (await req.json()) as T;
    } catch {
        return null;
    }
}

/** メソッドごとのハンドラ群 */
const handlers: Record<
    string,
    (params?: Record<string, unknown>, req?: Request) => Promise<Response>
> = {
    // 既存：最近 N 分の user_name を返す（User_list_test 参照）
    async "send-username-list"(params = {}) {
        const minutesRaw = params?.minutes;
        const minutes =
            typeof minutesRaw === "number" && isFinite(minutesRaw) && minutesRaw > 0
                ? minutesRaw
                : 10;
        const data = await fetchRecentUsernames(minutes);
        return json(data, 200);
    },

    // 既存：ユーザー保存
    async "save-user"(params = {}, req) {
        const user_name = String(params?.user_name ?? "").trim();
        const tab_id = String(params?.tab_id ?? "").trim();
        const device_id = String(params?.device_id ?? "").trim();
        const user_id =
            typeof params?.user_id === "string" && params.user_id ? String(params.user_id) : null;

        if (!user_name) return errorJson("user_name is required", 422);
        if (!tab_id) return errorJson("tab_id is required", 422);
        if (!device_id) return errorJson("device_id is required", 422);

        const row = { user_id, user_name, tab_id, device_id };
        const saved = await insertUserRow(row);
        return json({ ok: true, row: saved }, 201);
    },

    // 既存：タブ宛メッセージ
    async "push-to-tab"(params = {}, req) {
        const target_user_id = String(params?.target_user_id ?? "").trim();
        const tab_id =
            typeof params?.tab_id === "string" ? String(params.tab_id).trim() : undefined;
        const device_id =
            typeof params?.device_id === "string" ? String(params.device_id).trim() : undefined;
        const type = String(params?.type ?? "").trim();
        const payload = params?.payload ?? {};

        if (!target_user_id) return errorJson("target_user_id is required", 422);
        if (!type) return errorJson("type is required", 422);

        const inserted = await pushMessageToTab({
            user_id: target_user_id,
            tab_id,
            device_id,
            type,
            payload,
        });
        return json({ ok: true, message: inserted }, 201);
    },

    // ★ 新規：判定してルーティング指示を返す（引数なしでOK）
    // 返却: { ok:true, matched:boolean, leader_tab_id?: string, routes?: Array<{tab_id:string, to:string}>, counts:{ready:number, users:number} }
    async "decide-and-route"(_params = {}, _req) {
        const minutes = 10; // デフォルト
        const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();

        // 1) 最近N分のユーザー名（User_list_test）
        const recentUsers = await fetchRecentUsernames(minutes);
        const usersCount = recentUsers.length;

        // 2) 最近N分の is_ready
        const { data: readyRows, error: readyErr } = await supabaseAdmin
            .from("is_ready")
            .select("tab_id,user_name,created_at")
            .gte("created_at", since)
            .order("created_at", { ascending: true });

        if (readyErr) throw readyErr;

        const readyCount = readyRows?.length ?? 0;

        // 3) 件数が一致しなければ、まだ全員準備完了していない → 何もしない
        if (readyCount === 0 || readyCount !== usersCount) {
            return json({
                ok: true,
                matched: false,
                counts: { ready: readyCount, users: usersCount },
            });
        }

        // 4) 一致 → 最古の1件を親、その他を子に割り当て
        const leader = readyRows![0]; // created_at 最小
        const leaderTab = leader.tab_id as string;

        const routes = readyRows!.map((r) => ({
            tab_id: r.tab_id as string,
            to: (r.tab_id === leaderTab) ? "/parenttopick" : "/childwating", // ★ ルートは App.tsx に合わせる
        }));

        return json({
            ok: true,
            matched: true,
            leader_tab_id: leaderTab,
            routes,
            counts: { ready: readyCount, users: usersCount },
        });
    },
};

Deno.serve(async (req) => {
    const preflight = handleCorsOptions(req);
    if (preflight) return preflight;

    try {
        if (req.method === "GET") {
            const { searchParams } = new URL(req.url);
            const minutes = Number(searchParams.get("minutes") ?? "10");
            const safeMinutes =
                Number.isFinite(minutes) && minutes > 0 ? minutes : 10;
            const data = await fetchRecentUsernames(safeMinutes);
            return json(data, 200);
        }

        if (req.method === "POST") {
            const body = await readJson<Record<string, unknown>>(req);
            if (!body) return errorJson("Invalid JSON body", 400);

            const method =
                (body["method"] as string) ??
                (body["action"] as string) ??
                "send-username-list"; // 既定は従来の一覧

            const handler = handlers[method];
            if (!handler) return errorJson(`Unknown method: ${method}`, 400);

            const params = (body["params"] as Record<string, unknown>) ?? {};
            return await handler(params, req);
        }

        return errorJson("Method Not Allowed", 405);
    } catch (err) {
        const message =
            err instanceof Error
                ? err.message
                : typeof err === "string"
                    ? err
                    : "Unexpected error";
        return errorJson(message, 500);
    }
});
