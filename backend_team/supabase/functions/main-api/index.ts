// supabase/functions/main-api/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";
/** ---------------- CORS & helpers ---------------- **/ const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};
const json = (data, status = 200)=>new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
const err = (msg, status = 400, extra = {})=>json({
    ok: false,
    error: msg,
    ...extra
  }, status);
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
function assertOpenAIKey() {
  if (!OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set in Supabase Function Secrets");
    throw new Error("OPENAI_API_KEY not set");
  }
}
// === Gemini key & helper ===
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
function assertGeminiKey() {
  if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set in Supabase Function Secrets");
    throw new Error("GEMINI_API_KEY not set");
  }
}
/** Gemini JSON helper（responseSchema対応）
 * usage:
 *   const content = await geminiJson({
 *     model: "gemini-1.5-flash",
 *     system: "システム説明",
 *     user: "ユーザープロンプト",
 *     responseSchema: { type:"OBJECT", properties:{...}, required:[...] }
 *   });
 *   const obj = JSON.parse(content);
 */ async function geminiJson(opts) {
  assertGeminiKey();
  const model = opts.model ?? "gemini-1.5-flash";
  const payload = {
    contents: [
      ...opts.system ? [
        {
          role: "user",
          parts: [
            {
              text: opts.system
            }
          ]
        }
      ] : [],
      {
        role: "user",
        parts: [
          {
            text: opts.user
          }
        ]
      }
    ],
    generation_config: {
      temperature: typeof opts.temperature === "number" ? opts.temperature : 0.9
    }
  };
  if (opts.responseSchema) {
    payload.generation_config.response_mime_type = "application/json";
    payload.generation_config.response_schema = opts.responseSchema;
  }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text().catch(()=>"");
    throw new Error(`Gemini API error: ${res.status} ${text}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? data?.candidates?.[0]?.content?.parts?.[0]?.inline_data?.data ?? "";
  return String(text || "");
}
async function openaiChat(payload) {
  assertOpenAIKey();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text().catch(()=>"");
    throw new Error(`OpenAI API error: ${res.status} ${text}`);
  }
  return await res.json();
}
/** ------------------------------------------------- **/ /** --------------- server start log --------------- **/ console.info("main-api: server started (service-role + CORS)");
/** --------------- entrypoint --------------- **/ Deno.serve(async (req)=>{
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
  } catch  {
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
  const pickParam = (key)=>body?.params?.[key] ?? body?.[key];
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
  /** get-current-topic（user_log ベース） */ if (action === "get-current-topic") {
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
  /** submit-answer（user_log の最新1件を更新） */ if (action === "submit-answer") {
    const tab_id = String(pickParam("tab_id") ?? "").trim();
    const rawTxt = pickParam("txt");
    const txt = typeof rawTxt === "string" ? rawTxt.trim() : "";
    const cause = String(pickParam("cause") ?? "").trim(); // "timeout" なら空OK
    const allowEmpty = cause === "timeout";
    if (!tab_id) return json({
      ok: false,
      error: "tab_id is required"
    }, 200);
    if (!allowEmpty && !txt) {
      return json({
        ok: false,
        error: "txt is required"
      }, 200);
    }
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
      // ★ 空許可: timeout のときは "" を保存（未回答は NULL のまま）
      input_QA: allowEmpty ? "" : txt
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
  /** ---------- ★ 追加: list-parent-select-answers ---------- */ if (action === "list-parent-select-answers") {
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
    const answers = (data ?? []).filter((r)=>typeof r.user_name === "string" && typeof r.input_QA === "string").map((r)=>({
        user_name: r.user_name,
        input_QA: r.input_QA
      })) ?? [];
    return json({
      ok: true,
      answers
    }, 200);
  }
  /** ---------- ★ 追加: mark-selected-answer ---------- */ if (action === "mark-selected-answer") {
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
  /** ---------- ★ 追加: get-selected-answer ---------- */ if (action === "get-selected-answer") {
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
    const others = (othersRows ?? []).filter((r)=>typeof r.user_name === "string" && typeof r.input_QA === "string").map((r)=>({
        user_name: r.user_name,
        input_QA: r.input_QA
      })) ?? [];
    return json({
      ok: true,
      best,
      others
    }, 200);
  }
  /** ---------- ★ 新規追加: ready-to-next ---------- 
   * 入力: { tab_id }
   * 手順:
   *  1) user_log を tab_id で最新1件検索（id を取得）
   *  2) その行の next を TRUE に UPDATE
   * 返却: 204 No Content（成功時はボディなし／エラー時は JSON で返却）
   */ if (action === "ready-to-next") {
    const tab_id = String(pickParam("tab_id") ?? "").trim();
    if (!tab_id) return json({
      ok: false,
      error: "tab_id is required"
    }, 200);
    const { data: latest, error: selErr } = await supabase.from("user_log").select("id").eq("tab_id", tab_id).order("created_at", {
      ascending: false
    }).limit(1).maybeSingle();
    if (selErr) return json({
      ok: false,
      error: selErr.message
    }, 200);
    if (!latest?.id) return json({
      ok: false,
      error: "target row not found"
    }, 200);
    const { error: updErr } = await supabase.from("user_log").update({
      next: true
    }).eq("id", latest.id);
    if (updErr) return json({
      ok: false,
      error: updErr.message
    }, 200);
    // 返り値なし（204）
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }
  if (action === "openai-key-check") {
    const hasKey = !!(Deno.env.get("OPENAI_API_KEY") ?? "");
    return json({
      ok: true,
      hasKey
    }, 200);
  }
  /** ---------- CPU: 回答自動生成 ---------- */ if (action === "cpu-answer") {
    const tab_id = String(pickParam("tab_id") ?? "").trim(); // 誰のタブからでもOK
    const botName = String(pickParam("bot_name") ?? "CPU-1");
    const persona = String(pickParam("persona") ?? "punny"); // 作風: punny / witty / calm 等
    const maxChars = Number(pickParam("maxChars") ?? 12);
    if (!tab_id) return err("tab_id is required", 422);
    // 1) room/round を特定
    const { data: me, error: meErr } = await supabase.from("user_log").select("room_name, round").eq("tab_id", tab_id).order("created_at", {
      ascending: false
    }).limit(1).maybeSingle();
    if (meErr || !me?.room_name || typeof me?.round !== "number") {
      return err(meErr?.message ?? "failed to resolve room/round", 500);
    }
    // 2) 親のお題を取得
    const { data: host, error: hostErr } = await supabase.from("user_log").select("input_QA").eq("room_name", me.room_name).eq("round", me.round).eq("now_host", true).not("input_QA", "is", null).order("created_at", {
      ascending: false
    }).limit(1).maybeSingle();
    if (hostErr) return err(hostErr.message ?? "topic fetch failed", 500);
    const topic = String(host?.input_QA ?? "");
    if (!topic) return err("topic not ready yet", 400);
    // 3) 既出回答（重複回避のヒント）
    const { data: others } = await supabase.from("user_log").select("input_QA").eq("room_name", me.room_name).eq("round", me.round).eq("now_host", false).not("input_QA", "is", null);
    const avoid = (others ?? []).map((r)=>String(r.input_QA ?? "")).filter(Boolean).slice(0, 20);
    // 4) OpenAI で短い回答を JSON 生成
    const sys = "あなたはパーティゲームの参加者BOTです。\n" + `日本語で短い『回答』を1つだけ返します。最大文字数: ${maxChars}。\n` + "下品・攻撃的・政治・差別表現は不可。出力はJSONのみ。";
    const data = await openaiChat({
      model: "gpt-4o-mini",
      temperature: 0.95,
      response_format: {
        type: "json_object"
      },
      messages: [
        {
          role: "system",
          content: sys
        },
        {
          role: "user",
          content: `お題: ${topic}\n既出: ${avoid.join(" / ")}\n出力は {"answer":"..."} のみ。`
        }
      ]
    });
    const content = data?.choices?.[0]?.message?.content ?? "{}";
    let answer = "";
    try {
      answer = String(JSON.parse(content)?.answer ?? "").slice(0, maxChars);
    } catch  {}
    if (!answer) return err("failed to generate answer", 500);
    // 5) BOTの回答行を user_log に追加（子: now_host=false）
    const bot_tab = `cpu:${crypto.randomUUID()}`;
    const { data: inserted, error: insErr } = await supabase.from("user_log").insert({
      tab_id: bot_tab,
      room_name: me.room_name,
      round: me.round,
      now_host: false,
      user_name: botName,
      input_QA: answer
    }).select().single();
    if (insErr) return err(insErr.message ?? "insert failed", 500);
    return json({
      ok: true,
      answer,
      row: inserted
    }, 200);
  }
  /** ---------- 自分用AI: 親候補リスト（Gemini） ----------
 * 入力: { tab_id, count?=5, maxChars?=16, submitIndex?=null }
 * - 自分が今ラウンドの親でなければ 403（not_host）
 * - 候補 list を返す
 * - submitIndex 指定時はその候補で親行 input_QA を UPDATE
 */ 
if (action === "assist-topic-gemini-list") {
  try {
    const tab_id = String(pickParam("tab_id") ?? "").trim();
    const count = Math.max(3, Math.min(8, Number(pickParam("count") ?? 5)));
    const maxChars = Math.max(6, Math.min(30, Number(pickParam("maxChars") ?? 16)));
    const submitIndexRaw = pickParam("submitIndex");
    const submitIndex =
      submitIndexRaw === 0 || Number.isFinite(Number(submitIndexRaw))
        ? Number(submitIndexRaw)
        : null;

    if (!tab_id) return json({ ok: false, error: "tab_id is required" }, 422);

    // 自分の room/round/user
    const { data: me, error: meErr } = await supabase
      .from("user_log")
      .select("room_name, round, user_name")
      .eq("tab_id", tab_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (meErr) return json({ ok: false, error: meErr.message }, 500);
    if (!me?.room_name || typeof me?.round !== "number" || !me?.user_name)
      return json({ ok: false, error: "failed to resolve room/round/user" }, 400);

    // 自分が親？
    const { data: hostRow } = await supabase
      .from("user_log")
      .select("id")
      .eq("room_name", me.room_name)
      .eq("round", me.round)
      .eq("now_host", true)
      .eq("user_name", me.user_name)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!hostRow?.id) return json({ ok: false, error: "not_host" }, 403);

    // 候補生成（Gemini）
    const content = await geminiJson({
      model: "gemini-1.5-flash",
      system:
        `あなたは「朝までそれ正解」というパーティゲームの親。「○（ひらがな1文字）から始まる××なものは？」といった短い日本語のお題候補を ${count} 個作る。` +
        `各候補は最大${maxChars}文字。具体的でユーモラス。最初の一文字目はランダムなひらがな。固有名や攻撃/差別/政治は避ける。JSONで返す。`,
      user:
        `例: 「"あ"から始まる可愛いものは？」「"し"から始まる怖いものは？」「"の"から始まるうるさいものは？」\n` +
        `出力: {"list":["...","..."]}（${count}件、各${maxChars}文字以内）`,
      responseSchema: {
        type: "OBJECT",
        properties: {
          list: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["list"],
      },
    });

    // ---- サニタイズ & バリデーション（ここから） ----
    const normalize = (s: string) =>
      String(s ?? "")
        .replace(/\s+/g, " ")              // 連続空白→単一空白
        .replace(/[“”"＂]/g, "「")         // 引用符を和文に揃える（任意）
        .replace(/[’]/g, "’")
        .trim();

    const isValidTopicServer = (s: string) => {
      const t = normalize(s);
      if (!t) return false;
      if (t.length > maxChars) return false;
      // 形式の簡易チェック：「から始まる」と「？」が含まれている
      if (!t.includes("から始まる")) return false;
      if (!t.includes("？")) return false;
      // 不要な句読点や外れ値の軽い除外
      if (/https?:\/\//i.test(t)) return false;
      return true;
    };

    let list: string[] = [];
    try {
      const parsed = JSON.parse(content);
      list = Array.isArray(parsed?.list) ? parsed.list.map((s: any) => String(s)) : [];
    } catch {
      list = [];
    }

    // 正規化→重複排除→制約外を除外→件数を絞る
    list = Array.from(
      new Set(
        (list ?? [])
          .map((s) => normalize(s).slice(0, maxChars))
          .filter((s) => !!s)
      )
    )
      .filter(isValidTopicServer)
      .slice(0, count);

    // フォールバック
    if (list.length === 0) {
      list = [
        "あから始まる可愛いものは？",
        "しから始まる怖いものは？",
        "のから始まるうるさいものは？",
        "みから始まる美味しいものは？",
        "ゆから始まる涼しいものは？",
      ]
        .map((s) => s.slice(0, maxChars))
        .filter(isValidTopicServer)
        .slice(0, count);
    }
    // ---- サニタイズ & バリデーション（ここまで） ----

    // 即提出（任意）
    if (submitIndex !== null) {
      // submitIndex が範囲外・不正なら先頭の有効候補にフォールバック
      let pick =
        submitIndex >= 0 && submitIndex < list.length
          ? list[submitIndex]
          : list[0];

      // 念のため最終バリデーション
      if (!isValidTopicServer(pick)) {
        // 有効なものを探す
        const alt = list.find((s) => isValidTopicServer(s));
        if (alt) pick = alt;
      }

      // それでも無ければ最後のフォールバック
      if (!pick) {
        const fb = [
          "えから始まる明るいものは？",
          "おから始まる面白いものは？",
        ]
          .map((s) => s.slice(0, maxChars))
          .find((s) => isValidTopicServer(s));
        pick = fb ?? "あから始まる可愛いものは？".slice(0, maxChars);
      }

      const topic = pick;
      const { error: updErr } = await supabase
        .from("user_log")
        .update({ input_QA: topic })
        .eq("id", hostRow.id);
      if (updErr) return json({ ok: false, error: updErr.message }, 500);

      return json({ ok: true, list, submitted: topic }, 200);
    }

    // 候補だけ返す
    return json({ ok: true, list }, 200);
  } catch (e) {
    console.error("[assist-topic-gemini-list] error:", e);
    return json({ ok: false, error: String((e as any)?.message ?? e) }, 500);
  }
}

  /** ---------- 自分用AI: 子の回答候補リスト（Gemini） ----------
 * 入力: { tab_id, count?=5, maxChars?=12, submitIndex?=null }
 * - 親のお題を取得
 * - 既出回答を避けつつ候補 list を返す
 * - submitIndex 指定時は自分（子）の最新行 input_QA を UPDATE
 */ if (action === "assist-answer-gemini-list") {
    try {
      const tab_id = String(pickParam("tab_id") ?? "").trim();
      const count = Math.max(3, Math.min(8, Number(pickParam("count") ?? 5)));
      const maxChars = Math.max(6, Math.min(30, Number(pickParam("maxChars") ?? 12)));
      const submitIndexRaw = pickParam("submitIndex");
      const submitIndex = submitIndexRaw === 0 || Number.isFinite(Number(submitIndexRaw)) ? Number(submitIndexRaw) : null;
      if (!tab_id) return json({
        ok: false,
        error: "tab_id is required"
      }, 422);
      // 自分の room/round/user
      const { data: me, error: meErr } = await supabase.from("user_log").select("room_name, round, user_name").eq("tab_id", tab_id).order("created_at", {
        ascending: false
      }).limit(1).maybeSingle();
      if (meErr) return json({
        ok: false,
        error: meErr.message
      }, 500);
      if (!me?.room_name || typeof me?.round !== "number" || !me?.user_name) return json({
        ok: false,
        error: "failed to resolve room/round/user"
      }, 400);
      // お題
      const { data: host } = await supabase.from("user_log").select("input_QA").eq("room_name", me.room_name).eq("round", me.round).eq("now_host", true).not("input_QA", "is", null).order("created_at", {
        ascending: false
      }).limit(1).maybeSingle();
      const topic = String(host?.input_QA ?? "");
      if (!topic) return json({
        ok: false,
        error: "topic_not_ready"
      }, 400);
      // 既出回答（重複回避に渡す）
      const { data: others } = await supabase.from("user_log").select("input_QA").eq("room_name", me.room_name).eq("round", me.round).eq("now_host", false).not("input_QA", "is", null).order("created_at", {
        ascending: true
      });
      const avoid = (others ?? []).map((r)=>String(r.input_QA ?? "")).filter(Boolean).slice(0, 20);
      // 候補生成
      const content = await geminiJson({
        model: "gemini-1.5-flash",
        system: `あなたはパーティゲームの参加者。短い日本語の回答候補を ${count} 個。` + `各候補は最大${maxChars}文字。既出に似せない。下品/攻撃/差別は禁止。JSONで返す。`,
        user: `お題: ${topic}\n既出: ${avoid.join(" / ") || "なし"}\n` + `出力: {"list":["...","..."]}（${count}件、各${maxChars}文字以内）`,
        responseSchema: {
          type: "OBJECT",
          properties: {
            list: {
              type: "ARRAY",
              items: {
                type: "STRING"
              }
            }
          },
          required: [
            "list"
          ]
        }
      });
      let list = [];
      try {
        const parsed = JSON.parse(content);
        list = Array.isArray(parsed?.list) ? parsed.list.map((s)=>String(s).slice(0, maxChars)) : [];
      } catch  {}
      list = Array.from(new Set(list.filter(Boolean))).slice(0, count);
      if (list.length === 0) {
        list = [
          `${topic}！`.slice(0, maxChars),
          "それな",
          "天才の所業"
        ];
      }
      // 即提出（任意）
      if (submitIndex !== null && submitIndex >= 0 && submitIndex < list.length) {
        // 今ラウンドの自分（子）の最新行
        const { data: target } = await supabase.from("user_log").select("id").eq("room_name", me.room_name).eq("round", me.round).eq("now_host", false).eq("user_name", me.user_name).order("created_at", {
          ascending: false
        }).limit(1).maybeSingle();
        let targetId = target?.id ?? null;
        if (!targetId) {
          // フォールバック: 自分の最新行
          const { data: latestAny } = await supabase.from("user_log").select("id").eq("tab_id", tab_id).order("created_at", {
            ascending: false
          }).limit(1).maybeSingle();
          targetId = latestAny?.id ?? null;
        }
        if (!targetId) return json({
          ok: false,
          error: "no_target_row"
        }, 400);
        const answer = list[submitIndex];
        const { error: updErr } = await supabase.from("user_log").update({
          input_QA: answer
        }).eq("id", targetId);
        if (updErr) return json({
          ok: false,
          error: updErr.message
        }, 500);
        return json({
          ok: true,
          list,
          submitted: answer
        }, 200);
      }
      return json({
        ok: true,
        list
      }, 200);
    } catch (e) {
      console.error("[assist-answer-gemini-list] error:", e);
      return json({
        ok: false,
        error: String(e?.message ?? e)
      }, 500);
    }
  }
  return err("Unknown action", 400);
});
