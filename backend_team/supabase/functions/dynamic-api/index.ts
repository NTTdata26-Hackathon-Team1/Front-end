import { corsHeaders, handleCorsOptions } from "./cors.ts";
import { fetchRecentUsernames } from "./recentUsers.ts";

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

/** メソッドごとのハンドラ群（ここに追加していくだけ） */
const handlers = {
    // フロントから: body: { method: "send-username-list", params?: { minutes?: number } }
    async "send-username-list"(params: { minutes?: number } = {}) {
        const minutesRaw = params?.minutes;
        const minutes =
            typeof minutesRaw === "number" && isFinite(minutesRaw) && minutesRaw > 0
                ? minutesRaw
                : 10;

        const data = await fetchRecentUsernames(minutes);
        // 既存フロントの期待に合わせて「配列」をそのまま返す
        return json(data, 200);
    },

    // 例：将来的に増やすメソッド雛形
    // async "delete-user"(params: { id: number }) {
    //   // 実装…
    //   return json({ ok: true });
    // },
} satisfies Record<string, (params?: any) => Promise<Response>>;

Deno.serve(async (req) => {
    // CORS preflight
    const preflight = handleCorsOptions(req);
    if (preflight) return preflight;

    try {
        // --- 後方互換: GET /?minutes=10 でそのまま取得できる ---
        if (req.method === "GET") {
            const { searchParams } = new URL(req.url);
            const minutes = Number(searchParams.get("minutes") ?? "10");
            const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 10;
            const data = await fetchRecentUsernames(safeMinutes);
            return json(data, 200);
        }

        // --- 通常: POST(JSON) で method/params ディスパッチ ---
        if (req.method === "POST") {
            const body = await readJson<{ method?: string; params?: unknown }>(req);
            if (!body) return errorJson("Invalid JSON body", 400);

            const method = body.method ?? "send-username-list"; // デフォルトで現行メソッド
            const handler = handlers[method as keyof typeof handlers];
            if (!handler) return errorJson(`Unknown method: ${method}`, 400);

            return await handler(body.params as any);
        }

        // その他は許可しない
        return errorJson("Method Not Allowed", 405);
    } catch (err: unknown) {
        const message =
            err instanceof Error ? err.message : typeof err === "string" ? err : "Unexpected error";
        return errorJson(message, 500);
    }
});
