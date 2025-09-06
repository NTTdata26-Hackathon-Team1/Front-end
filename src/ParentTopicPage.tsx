import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import DanmakuInput from "./DanmakuInput";
import "./ParentTopicPage.css";

// sessionStorage から引き継ぎ
const getTabId = () => sessionStorage.getItem("tab_id") ?? "";

type GetRoundResp = { ok: boolean; round?: number; error?: string };
type SubmitTopicResp = { ok: boolean; row?: any; error?: string };

// AI候補 API の戻り型
type AiListResp = {
  ok: boolean;
  list?: string[];
  submitted?: string;
  error?: string;
};

const MAX_TOPIC_CHARS = 16;
const DEFAULT_TIMEOUT_SEC = 90;

// フォールバック（必ず「から始まる」「？」形式にしておく）
const FALLBACK_TOPICS = [
  "あから始まる可愛いものは？",
  "しから始まる怖いものは？",
  "のから始まるうるさいものは？",
  "たから始まる美味しいものは？",
  "もから始まる面白いものは？",
];

// ---- 候補の検証関数（制約に沿っているかを確認）----
const isValidTopic = (s: string, maxLen = MAX_TOPIC_CHARS) => {
  const t = (s ?? "").trim();
  if (!t) return false;
  if (t.length > maxLen) return false;
  // 例ベースの簡易ルール：「から始まる」と「？」を含む形式に限定
  if (!t.includes("から始まる")) return false;
  if (!t.includes("？")) return false;
  return true;
};

const ParentTopicPage: React.FC = () => {
  const [topic, setTopic] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 左上：ラウンド表示
  const [round, setRound] = useState<number | null>(null);
  const [roundLoading, setRoundLoading] = useState<boolean>(false);

  const navigate = useNavigate();

  // 90秒カウントダウンして自動確定
  const [secondsLeft, setSecondsLeft] = useState<number>(DEFAULT_TIMEOUT_SEC);
  const timedOutRef = useRef(false);

  // ===== AI 候補 UI =====
  const [aiLoading, setAiLoading] = useState(false);
  const [aiList, setAiList] = useState<string[]>([]);
  const [aiErr, setAiErr] = useState<string | null>(null);
  // ボタンを押すまで候補は見せない
  const [aiVisible, setAiVisible] = useState(false);
  // =====================

  // 起動時：バックエンドタイマー ping（任意）
  useEffect(() => {
    (async () => {
      try {
        await supabase.functions.invoke("time_management", {
          body: { action: "ping" },
        });
      } catch {
        // ログだけ
      }
    })();
  }, []);

  // 起動時：round を取得
  useEffect(() => {
    const fetchRound = async () => {
      const tab_id = getTabId();
      if (!tab_id) {
        setErr("tab_id が見つかりません（前画面での保存を確認してください）");
        return;
      }
      setRoundLoading(true);
      setErr(null);
      try {
        const { data, error } = await supabase.functions.invoke<GetRoundResp>(
          "main-api",
          {
            body: { action: "get-round", tab_id },
          }
        );
        if (error) {
          setErr(error.message ?? "ラウンド情報の取得に失敗しました");
          return;
        }
        if (!data?.ok || typeof data.round !== "number") {
          setErr((data as any)?.error ?? "ラウンド情報の取得に失敗しました");
          return;
        }
        setRound(data.round);
      } catch (e: any) {
        setErr(
          e?.message ?? "ラウンド情報の取得に失敗しました（unknown error）"
        );
      } finally {
        setRoundLoading(false);
      }
    };
    fetchRound();
  }, []);

  // ====== AI候補の取得（手動 + サイレント事前取得） ======
  // 候補配列を返すので、タイムアウト時にも即利用できる
  const fetchAiTopicsInternal = async (opts?: {
    silent?: boolean;
  }): Promise<string[]> => {
    const tab_id = getTabId();
    if (!tab_id) {
      if (!opts?.silent)
        setAiErr("tab_id が見つかりません（前画面での保存を確認してください）");
      return [];
    }
    setAiLoading(true);
    if (!opts?.silent) {
      setAiErr(null);
      setAiList([]);
    }
    try {
      const { data, error } = await supabase.functions.invoke<AiListResp>(
        "main-api",
        {
          body: {
            action: "assist-topic-gemini-list",
            tab_id,
            count: 5,
            maxChars: MAX_TOPIC_CHARS,
          },
        }
      );
      if (error) throw new Error(error.message ?? "AI候補の取得に失敗しました");
      if (!data?.ok)
        throw new Error(data?.error ?? "AI候補の取得に失敗しました");

      const raw = (data.list ?? [])
        .filter(Boolean)
        .map((s) => String(s).trim());
      // クライアント側でも軽くバリデーション
      const filtered = raw.filter((s) => isValidTopic(s));
      setAiList(filtered);
      return filtered;
    } catch (e: any) {
      if (!opts?.silent) setAiErr(e?.message ?? "AI候補の取得に失敗しました");
      console.error("assist-topic-gemini-list error:", e);
      return [];
    } finally {
      setAiLoading(false);
    }
  };

  // 手動取得：このときだけ候補を表示
  const fetchAiTopics = async () => {
    setAiVisible(true);
    await fetchAiTopicsInternal();
  };

  // サイレント事前取得（タイムアウトで即使える）
  useEffect(() => {
    fetchAiTopicsInternal({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 候補クリックで入力欄に反映
  const pickToInput = (text: string) =>
    setTopic(text.slice(0, MAX_TOPIC_CHARS));

  // 共通送信関数
  const submitTopic = async (txt: string) => {
    const tab_id = getTabId();
    if (!tab_id) {
      setErr("tab_id が見つかりません（前画面での保存を確認してください）");
      return false;
    }
    setSending(true);
    setErr(null);
    try {
      const { data, error } = await supabase.functions.invoke<SubmitTopicResp>(
        "main-api",
        {
          body: { action: "submit-topic", txt, tab_id },
        }
      );
      if (error) {
        setErr(error.message ?? "送信に失敗しました");
        return false;
      }
      if (!data?.ok) {
        setErr(data?.error ?? "送信に失敗しました");
        return false;
      }
      navigate("/parentwaiting", { state: { topic: txt } });
      return true;
    } catch (e: any) {
      setErr(e?.message ?? "予期せぬエラーが発生しました");
      return false;
    } finally {
      setSending(false);
    }
  };

  // サーバーに直接「この候補で送信」させる（必要なら使用）
  const submitAiTopic = async (index: number) => {
    const tab_id = getTabId();
    if (!tab_id) {
      setErr("tab_id が見つかりません（前画面での保存を確認してください）");
      return;
    }
    setSending(true);
    setErr(null);
    try {
      const { data, error } = await supabase.functions.invoke<AiListResp>(
        "main-api",
        {
          body: {
            action: "assist-topic-gemini-list",
            tab_id,
            count: 5,
            maxChars: MAX_TOPIC_CHARS,
            submitIndex: index,
          },
        }
      );
      if (error) throw new Error(error.message ?? "送信に失敗しました");
      if (!data?.ok) throw new Error(data?.error ?? "送信に失敗しました");

      const submitted = (data.submitted ?? aiList[index] ?? "").slice(
        0,
        MAX_TOPIC_CHARS
      );
      setTopic(submitted);
      navigate("/parentwaiting", { state: { topic: submitted } });
    } catch (e: any) {
      setErr(e?.message ?? "送信に失敗しました");
    } finally {
      setSending(false);
    }
  };

  // 手入力送信
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const txt = topic.trim();
    if (!txt || sending) return;
    await submitTopic(txt);
  };

  // タイムアウト時の処理
  const handleTimeout = async () => {
    if (timedOutRef.current) return;
    timedOutRef.current = true;
    if (sending) return;

    const typed = topic.trim();
    if (typed) {
      await submitTopic(typed);
      return;
    }

    // 空欄：AI 候補から選ぶ（画面には出さない）
    let candidate = aiList.find((s) => isValidTopic(s)) ?? "";

    if (!candidate) {
      const fetched = await fetchAiTopicsInternal({ silent: true });
      candidate = fetched.find((s) => isValidTopic(s)) ?? "";
    }

    if (!candidate) {
      candidate =
        FALLBACK_TOPICS.find((s) => isValidTopic(s)) ||
        "あから始まる楽しいものは？";
    }

    candidate = candidate.slice(0, MAX_TOPIC_CHARS);
    await submitTopic(candidate);
  };

  // カウントダウン：0 で handleTimeout
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="parenttopick-bg">
      {/* 背景装飾（master スタイル維持） */}
      <img
        src="/pixel_cloud_small.png"
        className="parenttopick-cloud left"
        alt="cloud"
      />
      <img
        src="/pixel_cloud_small.png"
        className="parenttopick-cloud right2"
        alt="cloud"
      />
      <img
        src="/pixel_cloud_small.png"
        className="parenttopick-cloud left2"
        alt="cloud"
      />
      <img
        src="/pixel_cloud_small.png"
        className="parenttopick-cloud right3"
        alt="cloud"
      />
      <img
        src="/pixel_cloud_small.png"
        className="parenttopick-cloud left3"
        alt="cloud"
      />
      <img
        src="/pixel_girl.png"
        className="parenttopick-character"
        alt="character"
      />
      <img
        src="/pixel_sunflower.png"
        className="parenttopick-sunflower"
        alt="sunflower"
      />
      <div className="parenttopick-fire-row">
        <img src="/pixel_fire.png" className="parenttopick-fire" alt="fire" />
        <img src="/pixel_fire.png" className="parenttopick-fire" alt="fire" />
        <img src="/pixel_fire.png" className="parenttopick-fire" alt="fire" />
      </div>
      <img
        src="/pixel_tree_bonsai.png"
        className="parenttopick-tree-bonsai"
        alt="tree-bonsai"
      />

      {/* ラウンド表示 */}
      <div className="parenttopick-round">
        ROUND {roundLoading ? "…" : round ?? "—"}
      </div>

      {/* タイトル・サブタイトル */}
      <div className="parenttopick-title">あなたは親です</div>
      <div className="parenttopick-subtitle">お題を入力してください</div>

      {/* 入力フォーム */}
      <form className="parenttopick-form" onSubmit={handleSubmit}>
        <input
          className="parenttopick-input"
          type="text"
          placeholder="お題入力欄"
          value={topic}
          onChange={(e) => setTopic(e.target.value.slice(0, MAX_TOPIC_CHARS))}
          disabled={sending}
        />
        <button
          className="parenttopick-btn"
          type="submit"
          disabled={!topic.trim() || sending}
        >
          {sending ? "送信中…" : "送信"}
        </button>
      </form>

      {/* 文字数ヘルパー */}
      <div className="parenttopick-helper">
        {topic.length}/{MAX_TOPIC_CHARS}
      </div>

      {/* AI候補ブロック */}
      <div className="parenttopick-ai">
        <div className="parenttopick-ai-head">
          <span className="parenttopick-ai-title">AI候補</span>
          <button
            type="button"
            className="parenttopick-btn secondary"
            onClick={fetchAiTopics}
            disabled={aiLoading}
          >
            {aiLoading ? "取得中…" : "AI候補を取得"}
          </button>
        </div>

        {/* ボタンを押したら表示 */}
        {aiVisible && (
          <>
            {!!aiErr && <div className="parenttopick-ai-error">{aiErr}</div>}

            <div className="parenttopick-ai-list">
              {aiList.map((t, i) => (
                <div key={i} className="parenttopick-ai-item">
                  <button
                    type="button"
                    className="parenttopick-chip"
                    onClick={() => pickToInput(t)}
                    title="クリックで入力欄に反映"
                  >
                    {t}
                  </button>

                  {/* 即送信したい場合は下のボタンも表示する */}
                  {/*
                  <button
                    type="button"
                    className="parenttopick-btn tiny"
                    onClick={() => submitAiTopic(i)}
                    disabled={sending}
                  >
                    この候補で送信
                  </button>
                  */}
                </div>
              ))}
              {aiList.length === 0 && !aiErr && (
                <div className="parenttopick-ai-hint">
                  候補がまだありません。
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 残り時間（右上固定） */}
      <div
        style={{
          position: "absolute",
          top: "1vw",
          right: "2vw",
          color: "#fff",
          fontWeight: "bold",
          fontSize: "3vw",
          textShadow: "0.2vw 0.2vw 0 #ff69b4",
          zIndex: 40,
        }}
        aria-live="polite"
      >
        残り時間: {secondsLeft} 秒
      </div>

      {/* エラー表示 */}
      {err && (
        <div
          style={{
            color: "#ff3333",
            marginTop: "1vw",
            fontWeight: "bold",
            fontSize: "1.2vw",
            textShadow: "0.1vw 0.1vw 0 #fff",
          }}
        >
          {err}
        </div>
      )}

      <DanmakuInput fixedBottom />
    </div>
  );
};

export default ParentTopicPage;
