import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import "./ChildAnswer.css";
import DanmakuInput from "./DanmakuInput";
import Round from "./component/round";

// ★ mm:ss 文字列に整形
function formatMs(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// ★ 追加: タイムアウト（2〜3分で調整）
const TIMEOUT_MS = 2 * 60 * 1000; // 2分（3分にする場合は 3 * 60 * 1000）

// sessionStorage から取得（TopMenu で保存済み想定）
const getTabId = () => sessionStorage.getItem("tab_id") ?? "";

type GetRoundResp = { ok: boolean; round?: number; error?: string };
type GetTopicResp = { ok: boolean; topic?: string | null; error?: string };
type SubmitAnswerResp = { ok: boolean; row?: any; updated?: boolean; error?: string };
type AiListResp = { ok: boolean; list?: string[]; submitted?: string; error?: string };

const MAX_ANSWER_CHARS = 12;

const ChildAnswer: React.FC = () => {
  // ★ 追加: 二重送信防止用
  const sentRef = useRef(false);
  // ★ 残り時間(ms)の状態
  const [remainingMs, setRemainingMs] = useState(TIMEOUT_MS);

  const [topic, setTopic] = useState<string | null>(null); // 取得したお題
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // お題のロード状態
  const [loadingTopic, setLoadingTopic] = useState(true);

  // ラウンド表示用
  const [round, setRound] = useState<number | null>(null);
  const [roundLoading, setRoundLoading] = useState<boolean>(false);

  // AI候補
  const [aiLoading, setAiLoading] = useState(false);
  const [aiList, setAiList] = useState<string[]>([]);
  const [aiErr, setAiErr] = useState<string | null>(null);

  const navigate = useNavigate();

  // 起動時にお題＆ラウンドを取得（main-api）
  useEffect(() => {
    let cancelled = false;
    const tab_id = getTabId();

    if (!tab_id) {
      setErrorMsg("tab_id が見つかりません（前画面での保存を確認してください）");
      setLoadingTopic(false);
      setRoundLoading(false);
      return () => {
        cancelled = true;
      };
    }

    // ラウンド
    (async () => {
      setRoundLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke<GetRoundResp>("main-api", {
          body: { action: "get-round", tab_id }, // トップレベルで送る
        });
        if (cancelled) return;

        if (error) {
          setErrorMsg(error.message ?? "ラウンド情報の取得に失敗しました");
        } else if (!data?.ok || typeof data.round !== "number") {
          setErrorMsg(data?.error ?? "ラウンド情報の取得に失敗しました");
        } else {
          setRound(data.round);
        }
      } catch (e: any) {
        if (!cancelled)
          setErrorMsg(e?.message ?? "ラウンド情報の取得に失敗しました（unknown error）");
      } finally {
        if (!cancelled) setRoundLoading(false);
      }
    })();

    // お題
    (async () => {
      setLoadingTopic(true);
      try {
        const { data, error } = await supabase.functions.invoke<GetTopicResp>("main-api", {
          body: { action: "get-current-topic", tab_id }, // こちらもトップレベルで送る
        });
        if (cancelled) return;

        if (error) {
          setErrorMsg(error.message ?? "お題の取得に失敗しました");
        } else if (!data?.ok) {
          setErrorMsg(data?.error ?? "お題の取得に失敗しました");
        } else {
          setTopic(
            typeof data.topic === "string" && data.topic.length > 0 ? data.topic : null
          );
        }
      } catch (e: any) {
        if (!cancelled)
          setErrorMsg(e?.message ?? "お題の取得に失敗しました（unknown error）");
      } finally {
        if (!cancelled) setLoadingTopic(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // コア送信処理（isTimeout=true でタイムアウト由来送信）
  const submitCore = async (txt: string, isTimeout = false) => {
    if (sentRef.current) return; // 二重送信防止
    sentRef.current = true;

    const tab_id = getTabId();
    if (!tab_id) {
      setErrorMsg("tab_id が見つかりません（前画面での保存を確認してください）");
      sentRef.current = false;
      return;
    }

    setSending(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase.functions.invoke<SubmitAnswerResp>("main-api", {
        body: {
          action: "submit-answer",
          tab_id,
          txt, // 空の可能性あり（タイムアウト時）
          // ★ 追加: タイムアウト起因なら cause を渡す（空回答許容のため）
          ...(isTimeout ? { cause: "timeout" } : {}),
        },
      });

      if (error) {
        setErrorMsg(error.message ?? "送信に失敗しました");
        sentRef.current = false;
      } else if (!data?.ok) {
        setErrorMsg(data?.error ?? "送信に失敗しました");
        sentRef.current = false;
      } else {
        navigate("/childanswerlist");
      }
    } catch (err: any) {
      setErrorMsg(err?.message ?? "送信エラー");
      sentRef.current = false;
    } finally {
      setSending(false);
    }
  };

  // 送信ボタン
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = answer.trim();
    if (!trimmed || sending || sentRef.current) return;
    await submitCore(trimmed);
  };

  // ★ ページ表示から TIMEOUT_MS 経過で、自動送信（空なら「(タイムアップ)」）
  useEffect(() => {
    const tab_id = getTabId();
    if (!tab_id) return;

    const timer = setTimeout(() => {
      if (sentRef.current) return; // すでに送信済みなら何もしない
      submitCore(answer.trim() || "(タイムアップ)", true);
    }, TIMEOUT_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ★ カウントダウン開始（ページ表示起点）
  useEffect(() => {
    setRemainingMs(TIMEOUT_MS); // 念のため初期化
    const iv = setInterval(() => {
      setRemainingMs((prev) => {
        if (prev <= 1000) {
          clearInterval(iv);
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);

    return () => clearInterval(iv);
  }, []);

  // === AI候補: 取得 ===
  const fetchAiAnswers = async () => {
    const tab_id = getTabId();
    if (!tab_id) {
      setAiErr("tab_id が見つかりません（前画面での保存を確認してください）");
      return;
    }
    setAiLoading(true);
    setAiErr(null);
    setAiList([]);
    try {
      const { data, error } = await supabase.functions.invoke<AiListResp>("main-api", {
        body: {
          action: "assist-answer-gemini-list",
          tab_id,
          count: 5,
          maxChars: MAX_ANSWER_CHARS,
        },
      });
      if (error) throw new Error(error.message ?? "AI候補の取得に失敗");
      if (!data?.ok) throw new Error(data?.error ?? "AI候補の取得に失敗");

      setAiList((data.list ?? []).map((s) => String(s).slice(0, MAX_ANSWER_CHARS)));
    } catch (e: any) {
      setAiErr(e?.message ?? "AI候補の取得に失敗");
    } finally {
      setAiLoading(false);
    }
  };

  // === AI候補: 入力欄に反映 ===
  const pickToInput = (text: string) =>
    setAnswer(String(text).slice(0, MAX_ANSWER_CHARS));

  return (
    <div className="childanswer-bg">
      {/* 雲・キャラ・花・火・盆栽などイラスト */}
      <img src="/pixel_cloud_small.png" alt="" className="childanswer-cloud-small" />
      <img src="/pixel_cloud_transparent.png" alt="" className="childanswer-cloud-transparent" />
      <img src="/pixel_character.png" alt="" className="childanswer-character" />
      <img src="/pixel_girl.png" alt="" className="childanswer-girl" />
      <img src="/pixel_flower.png" alt="" className="childanswer-flower1" />
      <img src="/pixel_flower.png" alt="" className="childanswer-flower2" />
      <img src="/pixel_tree_bonsai.png" alt="" className="childanswer-tree-bonsai" />
      <img src="/pixel_moon.png" alt="" className="childanswer-moon" />
      <img src="/pixel_mushroom.png" alt="" className="childanswer-mushroom" />
      {/* パイプ */}
      <div className="childanswer-pipe-row">
        <img src="/pixel_pipe.png" alt="" className="childanswer-pipe1" />
        <img src="/pixel_pipe.png" alt="" className="childanswer-pipe2" />
        <img src="/pixel_pipe.png" alt="" className="childanswer-pipe3" />
      </div>

      {/* ラウンド数（左上固定） */}
      {/* <div
        className="childanswer-round"
        style={{
          textShadow: "0 4px 24px #f52ba7ff, 0 1px 0 #f645bbff",
          fontWeight: 900,
          color: "#fcfbfbff",
        }}
      >
        ROUND {roundLoading ? "…" : round ?? "—"}
      </div> */}
      <Round round={round} loading={roundLoading} />

      {/* タイトル（中央大きく）＋お題 */}
      <div
        className="childanswer-title"
        style={{
          textShadow: "0 4px 24px #f52ba7ff, 0 1px 0 #f645bbff",
          fontWeight: 900,
          color: "#fcfbfbff",
        }}
      >
        {loadingTopic ? "お題を取得中…" : topic ? <>お題は 「{topic}」 です</> : "お題は未設定"}
      </div>

      {/* 右上：カウントダウン */}
      <div
        className="childanswer-countdown"
        aria-live="polite"
        style={{
          position: "fixed",
          top: 12,
          right: 12,
          background: "rgba(0,0,0,0.55)",
          color: "#fff",
          padding: "8px 12px",
          borderRadius: 12,
          fontWeight: 700,
          letterSpacing: "0.02em",
        }}
      >
        {formatMs(remainingMs)}
      </div>

      {/* 入力フォーム */}
      <form className="childanswer-form" onSubmit={handleSubmit}>
        <input
          className="childanswer-input"
          type="text"
          placeholder="解答を入力してください"
          value={answer}
          onChange={(e) => setAnswer(e.target.value.slice(0, MAX_ANSWER_CHARS))}
        />
        <button
          className="childanswer-btn"
          type="submit"
          disabled={!answer.trim() || sending}
        >
          {sending ? "送信中…" : "送信"}
        </button>
      </form>

      {/* AI候補UI */}
      <div style={{ marginTop: 12, textAlign: "center" }}>
        <button className="childanswer-btn" onClick={fetchAiAnswers} disabled={aiLoading}>
          {aiLoading ? "候補取得中…" : "AI候補を取得"}
        </button>
      </div>

      {aiErr && <div className="childanswer-error">{aiErr}</div>}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "center",
          marginTop: 8,
        }}
      >
        {aiList.map((a, i) => (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button className="childanswer-chip" onClick={() => pickToInput(a)}>
              {a}
            </button>
          </div>
        ))}
      </div>

      {errorMsg && <div className="childanswer-error">{errorMsg}</div>}
      <DanmakuInput fixedBottom />
    </div>
    
  );
};

export default ChildAnswer;
