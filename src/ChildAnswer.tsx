import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import "./ChildAnswer.css";
import DanmakuInput from "./DanmakuInput";

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

const ChildAnswer: React.FC = () => {
  // ★ 追加: 二重送信防止用
  const sentRef = React.useRef(false);
  // ★ 残り時間(ms)の状態
  const [remainingMs, setRemainingMs] = React.useState(TIMEOUT_MS);
  const [topic, setTopic] = useState<string | null>(null); // 取得したお題
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // お題のロード状態
  const [loadingTopic, setLoadingTopic] = useState(true);

  // ラウンド表示用
  const [round, setRound] = useState<number | null>(null);
  const [roundLoading, setRoundLoading] = useState<boolean>(false);

  const navigate = useNavigate();

  // 起動時にお題＆ラウンドを取得（main-api）
  useEffect(() => {
    let cancelled = false;
    const tab_id = getTabId();

    if (!tab_id) {
      setErrorMsg(
        "tab_id が見つかりません（前画面での保存を確認してください）"
      );
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
        const { data, error } = await supabase.functions.invoke<{
          ok: boolean;
          round?: number;
          error?: string;
        }>("main-api", {
          body: { action: "get-round", params: { tab_id } },
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
          setErrorMsg(
            e?.message ?? "ラウンド情報の取得に失敗しました（unknown error）"
          );
      } finally {
        if (!cancelled) setRoundLoading(false);
      }
    })();

    // お題
    (async () => {
      setLoadingTopic(true);
      try {
        const { data, error } = await supabase.functions.invoke<{
          ok: boolean;
          topic?: string | null;
          error?: string;
        }>("main-api", {
          body: { action: "get-current-topic", params: { tab_id } },
        });
        if (cancelled) return;

        if (error) {
          setErrorMsg(error.message ?? "お題の取得に失敗しました");
        } else if (!data?.ok) {
          setErrorMsg(data?.error ?? "お題の取得に失敗しました");
        } else {
          setTopic(
            typeof data.topic === "string" && data.topic.length > 0
              ? data.topic
              : null
          );
        }
      } catch (e: any) {
        if (!cancelled)
          setErrorMsg(
            e?.message ?? "お題の取得に失敗しました（unknown error）"
          );
      } finally {
        if (!cancelled) setLoadingTopic(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ★ 変更: タイムアウト時フラグ isTimeout を追加
  const submitCore = async (txt: string, isTimeout = false) => {
    if (sentRef.current) return; // 二重送信防止
    sentRef.current = true;

    const tab_id = getTabId();
    if (!tab_id) {
      setErrorMsg(
        "tab_id が見つかりません（前画面での保存を確認してください）"
      );
      sentRef.current = false;
      return;
    }

    setSending(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase.functions.invoke<{
        ok: boolean;
        row?: any;
        updated?: boolean;
        error?: string;
      }>("main-api", {
        body: {
          action: "submit-answer",
          params: {
            tab_id,
            txt, // 空の可能性あり（タイムアウト時）
            // ★ 追加: タイムアウト起因なら cause を渡す
            ...(isTimeout ? { cause: "timeout" } : {}),
          },
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = answer.trim();
    if (!trimmed || sending || sentRef.current) return;
    await submitCore(trimmed);
  };

  // ★ 追加: ページ表示から TIMEOUT_MS 経過で、入力途中でもその時点の内容で送信
  useEffect(() => {
    // tab_id がないなら自動送信はしない
    const tab_id = getTabId();
    if (!tab_id) return;

    const timer = setTimeout(() => {
      // すでに送信済みなら何もしない
      if (sentRef.current) return;

      // その時点の入力内容を送る（空なら空で送る）
      submitCore(answer.trim(), true);
    }, TIMEOUT_MS);

    return () => clearTimeout(timer);
    // ★ ページ表示起点のカウントにしたいので依存配列は空のまま
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
    // 依存配列は空：ページ表示から固定のカウントにする
  }, []);

  return (
    <div className="childanswer-bg">
      {/* 雲・キャラ・花・火・盆栽などイラスト */}
      <img
        src="/pixel_cloud_small.png"
        alt=""
        className="childanswer-cloud-small"
      />
      <img
        src="/pixel_cloud_transparent.png"
        alt=""
        className="childanswer-cloud-transparent"
      />
      <img
        src="/pixel_character.png"
        alt=""
        className="childanswer-character"
      />
      <img src="/pixel_girl.png" alt="" className="childanswer-girl" />
      <img src="/pixel_flower.png" alt="" className="childanswer-flower1" />
      <img src="/pixel_flower.png" alt="" className="childanswer-flower2" />
      <img
        src="/pixel_tree_bonsai.png"
        alt=""
        className="childanswer-tree-bonsai"
      />
      <img src="/pixel_moon.png" alt="" className="childanswer-moon" />
      <img src="/pixel_mushroom.png" alt="" className="childanswer-mushroom" />
      {/* パイプ */}
      <div className="childanswer-pipe-row">
        <img src="/pixel_pipe.png" alt="" className="childanswer-pipe1" />
        <img src="/pixel_pipe.png" alt="" className="childanswer-pipe2" />
        <img src="/pixel_pipe.png" alt="" className="childanswer-pipe3" />
      </div>

      {/* ラウンド数（左上固定） */}
      <div className="childanswer-round">
        ROUND {roundLoading ? "…" : round ?? "—"}
      </div>

      {/* タイトル（中央大きく）＋お題 */}
      <div className="childanswer-title">
        {loadingTopic ? (
          "お題を取得中…"
        ) : topic ? (
          <>お題は 「{topic}」 です</>
        ) : (
          "お題は未設定"
        )}
      </div>

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
          onChange={(e) => setAnswer(e.target.value)}
        />
        <button
          className="childanswer-btn"
          type="submit"
          disabled={!answer.trim() || sending}
        >
          {sending ? "送信中…" : "送信"}
        </button>
      </form>

      {errorMsg && <div className="childanswer-error">{errorMsg}</div>}
      <DanmakuInput fixedBottom />
    </div>
  );
};

export default ChildAnswer;
