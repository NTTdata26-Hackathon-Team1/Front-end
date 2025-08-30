import { corsHeaders, handleCorsOptions } from "./cors.ts";
import { fetchRecentUsernames } from "./recentUsers.ts";
import { insertUserRow, pushMessageToTab } from "./writers.ts";

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
    // params: { minutes?: number }
    async "send-username-list"(params = {}) {
        const minutesRaw = params?.minutes;
        const minutes =
            typeof minutesRaw === "number" && isFinite(minutesRaw) && minutesRaw > 0
                ? minutesRaw
                : 10;
        const data = await fetchRecentUsernames(minutes);
        return json(data, 200);
    },

    // 追加①：ユーザー入力（user_name / tab_id / device_id / user_id）を User_list_test へ保存
    // params: { user_id?: string, user_name: string, tab_id: string, device_id: string }
    async "save-user"(params = {}, req) {
        const user_name = String(params?.user_name ?? "").trim();
        const tab_id = String(params?.tab_id ?? "").trim();
        const device_id = String(params?.device_id ?? "").trim();
        const user_id =
            typeof params?.user_id === "string" && params.user_id ? String(params.user_id) : null;

        if (!user_name) return errorJson("user_name is required", 422);
        if (!tab_id) return errorJson("tab_id is required", 422);
        if (!device_id) return errorJson("device_id is required", 422);

        // （任意）Authorization 検証を入れたい場合は req.headers.get("Authorization") をチェックして、
        // トークンから user_id を照合・上書きする運用も可能。

        const row = { user_id, user_name, tab_id, device_id };
        const saved = await insertUserRow(row);
        return json({ ok: true, row: saved }, 201);
    },

    // 追加②：特定ユーザー / デバイス / タブ宛てにメッセージをキューイング（tab_messages へ INSERT）
    // params: { target_user_id: string, tab_id?: string, device_id?: string, type: string, payload: unknown }
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
        // tab_id / device_id はどちらか片方だけでもOK（粒度の指定用）
        if (!tab_id && !device_id) {
            // ユーザー単位配信だけにするならこのチェックは外せます
            // return errorJson("either tab_id or device_id is required", 422);
        }

        const inserted = await pushMessageToTab({
            user_id: target_user_id,
            tab_id,
            device_id,
            type,
            payload,
        });
        return json({ ok: true, message: inserted }, 201);
    },
};

Deno.serve(async (req) => {
    // CORS preflight
    const preflight = handleCorsOptions(req);
    if (preflight) return preflight;

    try {
        // --- 後方互換: GET /?minutes=10 で最近ユーザー名取得 ---
        if (req.method === "GET") {
            const { searchParams } = new URL(req.url);
            const minutes = Number(searchParams.get("minutes") ?? "10");
            const safeMinutes =
                Number.isFinite(minutes) && minutes > 0 ? minutes : 10;
            const data = await fetchRecentUsernames(safeMinutes);
            return json(data, 200);
        }

        // --- 通常: POST(JSON) で method/params ディスパッチ ---
        if (req.method === "POST") {
            const body = await readJson<Record<string, unknown>>(req);
            if (!body) return errorJson("Invalid JSON body", 400);

            // 互換性のため action も受け付ける
            const method =
                (body["method"] as string) ??
                (body["action"] as string) ??
                "send-username-list";

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
