// supabase/functions/polling-api/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";
// ---- CORS ----
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS,GET"
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
// ---- Startup log ----
console.info("polling-api: server started (service-role + CORS)");
/** ユーティリティ: [最新, 最古, 2番目に古い, …] に並べ替え */ function newestFirstThenOldAsc(rows) {
    if (!rows || rows.length === 0) return [];
    const asc = [
        ...rows
    ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); // 古い→新しい
    const newest = asc[asc.length - 1];
    return [
        newest,
        ...asc.slice(0, asc.length - 1)
    ];
}
Deno.serve(async (req) => {
    // CORS preflight
    if (req.method === "OPTIONS") return new Response("ok", {
        headers: corsHeaders
    });
    // Env -> Service Role client
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return err("Env not set: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY", 500);
    const supabase = createClient(url, serviceKey, {
        auth: {
            persistSession: false
        }
    });
    // Optional GET support: /?minutes=30  → list-rooms と同義
    if (req.method === "GET") {
        const { searchParams } = new URL(req.url);
        const minutes = Number(searchParams.get("minutes") ?? "30");
        return await listRoomsHandler(supabase, Number.isFinite(minutes) && minutes > 0 ? minutes : 30);
    }
    // POST body
    if (req.method !== "POST") return err("Method Not Allowed", 405);
    let body;
    try {
        body = await req.json();
    } catch {
        return err("Invalid JSON body", 400);
    }
    const action = String(body.action ?? body.method ?? "").trim();
    const pickParam = (k) => body?.params?.[k] ?? body?.[k];
    if (action === "list-rooms") {
        const mRaw = body.minutes;
        const minutes = typeof mRaw === "number" && Number.isFinite(mRaw) && mRaw > 0 ? mRaw : 30;
        return await listRoomsHandler(supabase, minutes);
    }
    if (action === "get-room-info") {
        const tab_id = String(pickParam("tab_id") ?? "").trim();
        return await getRoomInfoHandler(supabase, tab_id);
    }
    if (action === "decide-and-route") {
        const tab_id = String(pickParam("tab_id") ?? "").trim();
        return await decideAndRouteHandler(supabase, tab_id);
    }
    // ★ 追加: is-topic-ready
    if (action === "is-topic-ready") {
        const tab_id = String(pickParam("tab_id") ?? "").trim();
        return await isTopicReadyHandler(supabase, tab_id);
    }
    // ★ 追加済み: list-child-answers
    if (action === "list-child-answers") {
        const tab_id = String(pickParam("tab_id") ?? "").trim();
        return await listChildAnswersHandler(supabase, tab_id);
    }
    // ★ 追加済み: is-selection-decided
    if (action === "is-selection-decided") {
        const tab_id = String(pickParam("tab_id") ?? "").trim();
        return await isSelectionDecidedHandler(supabase, tab_id);
    }
    // ★ 新規追加: are-children-answers-complete
    if (action === "are-children-answers-complete") {
        const tab_id = String(pickParam("tab_id") ?? "").trim();
        return await areChildrenAnswersListHandler(supabase, tab_id);
    }
    return err("Unknown action", 400);
});
/**
 * list-rooms:
 * - room_info_TEMP から 直近 `minutes` 分の {room_name, num_of_nowusers, created_at} を取得
 * - created_at の新しい順に見て、同じ room_name は最新の1件だけ採用
 * - 返却: { ok:true, rooms: [{ room_name, num_of_nowusers }] }
 */ async function listRoomsHandler(supabase, minutes) {
    const sinceIso = new Date(Date.now() - minutes * 60 * 1000).toISOString();
    const { data, error } = await supabase.from("room_info_TEMP").select("room_name, num_of_nowusers, created_at").gte("created_at", sinceIso).order("created_at", {
        ascending: false
    });
    if (error) {
        console.error("select room_info_TEMP error:", error);
        return err("failed to fetch room list", 500, {
            code: error.code ?? null,
            details: error.details ?? error.message,
            hint: error.hint ?? null
        });
    }
    // 同名 room は最新のみ残す
    const latestByName = new Map();
    for (const row of data ?? []) {
        const rn = String(row.room_name ?? "").trim();
        if (!rn || latestByName.has(rn)) continue;
        latestByName.set(rn, {
            room_name: rn,
            num_of_nowusers: typeof row.num_of_nowusers === "number" ? row.num_of_nowusers : null
        });
    }
    const rooms = Array.from(latestByName.values());
    return json({
        ok: true,
        rooms
    }, 200);
}
/**
 * get-room-info:
 * 入力: tab_id
 *  1) user_log を tab_id で最新1件検索し room_name を得る
 *  2) user_log を room_name で検索し members と num_of_nowusers を作る
 *  3) room_info_TEMP を room_name で最新1件検索し num_of_rounds を取得
 */ async function getRoomInfoHandler(supabase, tab_id) {
    if (!tab_id) {
        return json({
            ok: true,
            room_name: null,
            num_of_rounds: null,
            members: [],
            num_of_nowusers: 0
        }, 200);
    }
    // 1) 自分の room_name
    const { data: myRow, error: myErr } = await supabase.from("user_log").select("room_name, created_at").eq("tab_id", tab_id).order("created_at", {
        ascending: false
    }).limit(1).maybeSingle();
    if (myErr) {
        return err("failed to fetch user_log by tab_id", 500, {
            code: myErr.code ?? null,
            details: myErr.details ?? myErr.message,
            hint: myErr.hint ?? null
        });
    }
    const room_nameRaw = myRow?.room_name;
    const room_name = typeof room_nameRaw === "string" && room_nameRaw.trim() ? room_nameRaw.trim() : null;
    if (!room_name) {
        return json({
            ok: true,
            room_name: null,
            num_of_rounds: null,
            members: [],
            num_of_nowusers: 0
        }, 200);
    }
    // 2) メンバー一覧
    const { data: memberRows, error: memErr } = await supabase.from("user_log").select("user_name, created_at").eq("room_name", room_name).order("created_at", {
        ascending: true
    });
    if (memErr) {
        return err("failed to fetch members in user_log", 500, {
            code: memErr.code ?? null,
            details: memErr.details ?? memErr.message,
            hint: memErr.hint ?? null
        });
    }
    const members = (memberRows ?? []).map((r) => typeof r.user_name === "string" ? r.user_name : null).filter((v) => !!v);
    const num_of_nowusers = members.length;
    // 3) ラウンド数
    const { data: infoRow, error: infoErr } = await supabase.from("room_info_TEMP").select("num_of_rounds, created_at").eq("room_name", room_name).order("created_at", {
        ascending: false
    }).limit(1).maybeSingle();
    if (infoErr) {
        return err("failed to fetch room_info_TEMP", 500, {
            code: infoErr.code ?? null,
            details: infoErr.details ?? infoErr.message,
            hint: infoErr.hint ?? null
        });
    }
    const num_of_rounds = infoRow && typeof infoRow.num_of_rounds === "number" ? infoRow.num_of_rounds : null;
    return json({
        ok: true,
        room_name,
        num_of_rounds,
        members,
        num_of_nowusers
    }, 200);
}
/**
 * decide-and-route（A/B 分岐版）
 * 入力: tab_id
 *  A) 初回: ready=true の人数が num_of_totalusers と一致 → ラウンド開始
 *  B) 2回目以降: next=true の人数が num_of_totalusers と一致 → 全 next=false → 終了判定 or 次ラウンド
 */ async function decideAndRouteHandler(supabase, tab_id) {
    if (!tab_id) return json({
        ok: false,
        matched: false,
        error: "tab_id is required"
    }, 200);
    // 自タブの最新行
    const { data: myRow, error: myErr } = await supabase.from("user_log").select("room_name, user_name, round, created_at").eq("tab_id", tab_id).order("created_at", {
        ascending: false
    }).limit(1).maybeSingle();
    if (myErr) return json({
        ok: false,
        matched: false,
        error: myErr.message
    }, 200);
    if (!myRow?.room_name) {
        return json({
            ok: true,
            matched: false,
            reason: "no room for this tab yet"
        }, 200);
    }
    const room_name = String(myRow.room_name);
    const currentRound = typeof myRow.round === "number" ? myRow.round : 0;
    // ---------- (A) round === 0 : ready 集合で進行判定 ----------
    if (currentRound === 0) {
        const { count: a, error: aErr } = await supabase.from("user_log").select("id", {
            count: "exact",
            head: true
        }).eq("room_name", room_name).eq("ready", true);
        if (aErr) return json({
            ok: false,
            matched: false,
            error: aErr.message
        }, 200);
        const { data: infoRow, error: infoErr } = await supabase.from("room_info_TEMP").select("num_of_totalusers, created_at").eq("room_name", room_name).order("created_at", {
            ascending: false
        }).limit(1).maybeSingle();
        if (infoErr) return json({
            ok: false,
            matched: false,
            error: infoErr.message
        }, 200);
        const b = typeof infoRow?.num_of_totalusers === "number" ? infoRow.num_of_totalusers : null;
        if (!b || (a ?? 0) !== b) {
            return json({
                ok: true,
                matched: false,
                counts: {
                    a: a ?? 0,
                    b: b ?? 0
                }
            }, 200);
        }
        // 進行：newRound & now_host 判定
        const newRound = currentRound + 1;
        const { data: peers, error: peersErr } = await supabase.from("user_log").select("tab_id, user_name, created_at").eq("room_name", room_name).order("created_at", {
            ascending: true
        });
        if (peersErr) return json({
            ok: false,
            matched: false,
            error: peersErr.message
        }, 200);
        const ordered = newestFirstThenOldAsc(peers ?? []);
        let n = ordered.findIndex((r) => r.tab_id === tab_id);
        if (n < 0) n = 0;
        const N = b; // メンバー数＝num_of_totalusers
        const hostFlag = newRound % N === n;
        const { error: insErr } = await supabase.from("user_log").insert({
            tab_id,
            room_name,
            user_name: myRow.user_name ?? null,
            round: newRound,
            now_host: hostFlag
        });
        if (insErr) return json({
            ok: false,
            matched: false,
            error: insErr.message
        }, 200);
        return json({
            ok: true,
            matched: true,
            now_host: hostFlag,
            to: hostFlag ? "/parenttopick" : "/childwating",
            round: newRound,
            room_name,
            n,
            N
        }, 200);
    }
    // ---------- (B) round !== 0 : next 集合で進行判定（新仕様） ----------
    const { count: a2, error: aErr2 } = await supabase.from("user_log").select("id", {
        count: "exact",
        head: true
    }).eq("room_name", room_name).eq("next", true);
    if (aErr2) return json({
        ok: false,
        matched: false,
        error: aErr2.message
    }, 200);
    const { data: infoRow2, error: infoErr2 } = await supabase.from("room_info_TEMP").select("num_of_totalusers, created_at").eq("room_name", room_name).order("created_at", {
        ascending: false
    }).limit(1).maybeSingle();
    if (infoErr2) return json({
        ok: false,
        matched: false,
        error: infoErr2.message
    }, 200);
    const b2 = typeof infoRow2?.num_of_totalusers === "number" ? infoRow2.num_of_totalusers : null;
    if (!b2 || (a2 ?? 0) !== b2) {
        return json({
            ok: true,
            matched: false,
            counts: {
                a: a2 ?? 0,
                b: b2 ?? 0
            }
        }, 200);
    }
    // 全プレイヤーが next=true → 全行の next を FALSE にリセット
    const { error: resetErr } = await supabase.from("user_log").update({
        next: false
    });
    if (resetErr) return json({
        ok: false,
        matched: false,
        error: resetErr.message
    }, 200);
    // 最新の自タブ行を取り直す（c, room 再取得）
    const { data: myRow2, error: myErr2 } = await supabase.from("user_log").select("room_name, user_name, round, created_at").eq("tab_id", tab_id).order("created_at", {
        ascending: false
    }).limit(1).maybeSingle();
    if (myErr2) return json({
        ok: false,
        matched: false,
        error: myErr2.message
    }, 200);
    const room_name2 = String(myRow2?.room_name ?? room_name);
    const c = typeof myRow2?.round === "number" ? myRow2.round : 0;
    // この部屋の総ラウンド数 d と総人数（N 用）
    const { data: infoRow3, error: infoErr3 } = await supabase.from("room_info_TEMP").select("num_of_rounds, num_of_totalusers, created_at").eq("room_name", room_name2).order("created_at", {
        ascending: false
    }).limit(1).maybeSingle();
    if (infoErr3) return json({
        ok: false,
        matched: false,
        error: infoErr3.message
    }, 200);
    const d = typeof infoRow3?.num_of_rounds === "number" ? infoRow3.num_of_rounds : null;
    const totalUsers = typeof infoRow3?.num_of_totalusers === "number" ? infoRow3.num_of_totalusers : b2 ?? 1;
    // ラウンド終了 → lastanswer
    if (d !== null && c === d) {
        return json({
            ok: true,
            matched: true,
            to: "/lastanswer",
            finished: true,
            round: c,
            room_name: room_name2
        }, 200);
    }
    // 続行：ラウンド +1 & now_host 判定
    const newRound2 = c + 1;
    const { data: peers3, error: peersErr3 } = await supabase.from("user_log").select("tab_id, user_name, created_at").eq("room_name", room_name2).order("created_at", {
        ascending: true
    });
    if (peersErr3) return json({
        ok: false,
        matched: false,
        error: peersErr3.message
    }, 200);
    const ordered3 = newestFirstThenOldAsc(peers3 ?? []);
    let n3 = ordered3.findIndex((r) => r.tab_id === tab_id);
    if (n3 < 0) n3 = 0;
    const N3 = totalUsers ?? 1;
    const hostFlag3 = newRound2 % N3 === n3;
    const { error: insErr3 } = await supabase.from("user_log").insert({
        tab_id,
        room_name: room_name2,
        user_name: myRow2.user_name ?? null,
        round: newRound2,
        now_host: hostFlag3
    });
    if (insErr3) return json({
        ok: false,
        matched: false,
        error: insErr3.message
    }, 200);
    return json({
        ok: true,
        matched: true,
        now_host: hostFlag3,
        to: hostFlag3 ? "/parenttopick" : "/childwating",
        round: newRound2,
        room_name: room_name2,
        n: n3,
        N: N3
    }, 200);
}
/**
 * ★ 追加: is-topic-ready
 * 入力: tab_id
 * 手順:
 *  1) user_log から tab_id 最新1件を取得し、room_name と round を得る
 *  2) user_log を room_name & round で検索し、input_QA が null でない行があるかを確認
 * 返却: { ok:true, ready:boolean }（エラー時は ok:false, ready:false, error 付き）
 */ async function isTopicReadyHandler(supabase, tab_id) {
    if (!tab_id) return json({
        ok: false,
        ready: false,
        error: "tab_id is required"
    }, 200);
    // 1) 最新の自タブ行
    const { data: myRow, error: myErr } = await supabase.from("user_log").select("room_name, round, created_at").eq("tab_id", tab_id).order("created_at", {
        ascending: false
    }).limit(1).maybeSingle();
    if (myErr) return json({
        ok: false,
        ready: false,
        error: myErr.message
    }, 200);
    const room_name = typeof myRow?.room_name === "string" ? myRow.room_name : null;
    const round = typeof myRow?.round === "number" ? myRow.round : null;
    if (!room_name || round === null) {
        return json({
            ok: true,
            ready: false
        }, 200);
    }
    // 2) 同じ room_name & round で input_QA が null でない行があるか？
    const { count, error } = await supabase.from("user_log").select("id", {
        count: "exact",
        head: true
    }).eq("room_name", room_name).eq("round", round).not("input_QA", "is", null);
    if (error) return json({
        ok: false,
        ready: false,
        error: error.message
    }, 200);
    const ready = (count ?? 0) > 0;
    return json({
        ok: true,
        ready
    }, 200);
}
/**
 * ★ 追加: list-child-answers
 * 入力: tab_id
 * 手順:
 *  1) user_log から tab_id 最新1件を取得し、room_name と round を得る
 *  2) user_log を room_name & round & now_host=false で検索し、
 *     取得したレコードの { user_name, input_QA } の配列を返却
 */ async function listChildAnswersHandler(supabase, tab_id) {
    if (!tab_id) return json({
        ok: false,
        error: "tab_id is required"
    }, 200);
    // 1) 最新の自タブ行から room_name, round を取得
    const { data: myRow, error: myErr } = await supabase.from("user_log").select("room_name, round, created_at").eq("tab_id", tab_id).order("created_at", {
        ascending: false
    }).limit(1).maybeSingle();
    if (myErr) return json({
        ok: false,
        error: myErr.message
    }, 200);
    const room_name = typeof myRow?.room_name === "string" ? myRow.room_name : null;
    const round = typeof myRow?.round === "number" ? myRow.round : null;
    if (!room_name || round === null) {
        return json({
            ok: true,
            answers: []
        }, 200);
    }
    // 2) 同条件で now_host=false かつ input_QA NOT NULL の行を取得
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
/**
 * ★ 追加: is-selection-decided
 * 入力: tab_id
 * 手順:
 *  1) user_log から tab_id 最新1件を取得し、room_name と round を得る
 *  2) user_log を room_name & round で検索し、vote_to='SELECTED' の行が存在するか判定
 * 返却: { ok:true, decided:boolean }
 */ async function isSelectionDecidedHandler(supabase, tab_id) {
    if (!tab_id) return json({
        ok: false,
        decided: false,
        error: "tab_id is required"
    }, 200);
    // 1) 最新の自タブ行
    const { data: myRow, error: myErr } = await supabase.from("user_log").select("room_name, round, created_at").eq("tab_id", tab_id).order("created_at", {
        ascending: false
    }).limit(1).maybeSingle();
    if (myErr) return json({
        ok: false,
        decided: false,
        error: myErr.message
    }, 200);
    const room_name = typeof myRow?.room_name === "string" ? myRow.room_name : null;
    const round = typeof myRow?.round === "number" ? myRow.round : null;
    if (!room_name || round === null) {
        return json({
            ok: true,
            decided: false
        }, 200);
    }
    // 2) 同条件で vote_to='SELECTED' が存在するか
    const { count, error } = await supabase.from("user_log").select("id", {
        count: "exact",
        head: true
    }).eq("room_name", room_name).eq("round", round).eq("vote_to", "SELECTED");
    if (error) return json({
        ok: false,
        decided: false,
        error: error.message
    }, 200);
    const decided = (count ?? 0) > 0;
    return json({
        ok: true,
        decided
    }, 200);
}
/**
 * ★ 新規追加: are-children-answers-complete
 * 入力: tab_id
 * 手順:
 *  1) user_log から同 tab_id の全行を参照し、うち created_at が最新の 1 行を取得
 *     → その行の room_name と round を取得
 *  2) user_log を room_name & round で検索し、
 *     now_host=false かつ input_QA が null でない行の総数を a とする
 *  3) room_info_TEMP を room_name で最新 1 件取得し、num_of_totalusers を得る
 *     → b = (num_of_totalusers - 1)
 *  4) { ok:true, ready:(a===b), a, b } を返却
 */ async function areChildrenAnswersListHandler(supabase, tab_id) {
    if (!tab_id) return json({
        ok: false,
        ready: false,
        a: 0,
        b: 0,
        error: "tab_id is required"
    }, 200);
    // 1) 対象 tab_id の最新行（room_name, round）
    const { data: latestRow, error: latestErr } = await supabase.from("user_log").select("room_name, round, created_at").eq("tab_id", tab_id).order("created_at", {
        ascending: false
    }).limit(1).maybeSingle();
    if (latestErr) return json({
        ok: false,
        ready: false,
        a: 0,
        b: 0,
        error: latestErr.message
    }, 200);
    const room_name = typeof latestRow?.room_name === "string" ? latestRow.room_name : null;
    const round = typeof latestRow?.round === "number" ? latestRow.round : null;
    if (!room_name || round === null) {
        // 部屋やラウンドがまだ定まっていない
        return json({
            ok: true,
            ready: false,
            a: 0,
            b: 0
        }, 200);
    }
    // 2) 子の回答数 a をカウント（now_host=false & input_QA not null）
    const { count: a, error: aErr } = await supabase.from("user_log").select("id", {
        count: "exact",
        head: true
    }).eq("room_name", room_name).eq("round", round).eq("now_host", false).not("input_QA", "is", null);
    if (aErr) return json({
        ok: false,
        ready: false,
        a: 0,
        b: 0,
        error: aErr.message
    }, 200);
    // 3) b を算出（num_of_totalusers - 1）
    const { data: roomInfo, error: roomErr } = await supabase.from("room_info_TEMP").select("num_of_totalusers, created_at").eq("room_name", room_name).order("created_at", {
        ascending: false
    }).limit(1).maybeSingle();
    if (roomErr) return json({
        ok: false,
        ready: false,
        a: a ?? 0,
        b: 0,
        error: roomErr.message
    }, 200);
    const total = typeof roomInfo?.num_of_totalusers === "number" ? roomInfo.num_of_totalusers : null;
    const b = total !== null && Number.isFinite(total) ? Math.max(0, total - 1) : 0;
    const ready = (a ?? 0) === b;
    return json({
        ok: true,
        ready,
        a: a ?? 0,
        b
    }, 200);
}
