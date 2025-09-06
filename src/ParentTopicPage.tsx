import React, { useEffect, useRef, useState } from "react";
import { Typography, TextField, Button, Box, Chip, Stack } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

// sessionStorage から引き継ぎ
const getTabId = () => sessionStorage.getItem("tab_id") ?? "";

type GetRoundResp = { ok: boolean; round?: number; error?: string };
type SubmitTopicResp = { ok: boolean; row?: any; error?: string };

// AI候補 API の戻り型
type AiListResp = { ok: boolean; list?: string[]; submitted?: string; error?: string };

const MAX_TOPIC_CHARS = 16;
const DEFAULT_TIMEOUT_SEC = 20;

// フォールバック用の簡易お題（AI取得が失敗した時の最終手段）
const FALLBACK_TOPICS = ["朝に強くなる方法", "最近笑ったこと", "最強のおにぎり具", "休日の最適解", "子供の頃の夢"];

// ---- 追加: 候補の検証関数（制約に沿っているかを確認）----
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

  // 20秒カウントダウンして自動遷移（※タイムアウト処理を差し替え）
  const [secondsLeft, setSecondsLeft] = useState<number>(DEFAULT_TIMEOUT_SEC);

  // タイムアウト時の多重実行防止
  const timedOutRef = useRef(false);

  // ===== ここから AI 候補 UI 追加 =====
  const [aiLoading, setAiLoading] = useState(false);
  const [aiList, setAiList] = useState<string[]>([]);
  const [aiErr, setAiErr] = useState<string | null>(null);

  // 表示フラグ：ボタンを押すまで候補は見せない
  const [aiVisible, setAiVisible] = useState(false);
  // ===== AI 候補 UI ここまで =====

  // ページ起動時：time_management を呼ぶ、バックエンドでタイマー管理
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.functions.invoke("time_management", {
        body: { action: "ping" },
      });
      console.log("ping:", { data, error });
    })();
  }, []);

  // ページ起動時：main-api の get-round を呼んで round を取得して表示
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
        const { data, error } = await supabase.functions.invoke<GetRoundResp>("main-api", {
          body: { action: "get-round", tab_id },
        });
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
        setErr(e?.message ?? "ラウンド情報の取得に失敗しました（unknown error）");
      } finally {
        setRoundLoading(false);
      }
    };
    fetchRound();
  }, []);

  // ====== AI候補の取得ロジック（手動 + サイレント事前取得） ======
  // 戻り値としても候補配列を返す（タイムアウト時は戻り値を即使用）
  const fetchAiTopicsInternal = async (opts?: { silent?: boolean }): Promise<string[]> => {
    const tab_id = getTabId();
    if (!tab_id) {
      if (!opts?.silent) setAiErr("tab_id が見つかりません（前画面での保存を確認してください）");
      return [];
    }
    setAiLoading(true);
    if (!opts?.silent) {
      setAiErr(null);
      setAiList([]);
    }
    try {
      const { data, error } = await supabase.functions.invoke<AiListResp>("main-api", {
        body: {
          action: "assist-topic-gemini-list",
          tab_id,
          count: 5,
          maxChars: MAX_TOPIC_CHARS,
        },
      });
      if (error) throw new Error(error.message ?? "AI候補の取得に失敗しました");
      if (!data?.ok) throw new Error(data?.error ?? "AI候補の取得に失敗しました");

      const raw = (data.list ?? []).filter(Boolean).map(s => String(s).trim());
      // クライアント側でも軽くバリデーション
      const filtered = raw.filter(s => isValidTopic(s));
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

  // 手動取得：このときだけ画面に表示
  const fetchAiTopics = async () => {
    setAiVisible(true);     // ← ここで候補を表示する
    await fetchAiTopicsInternal();
  };

  // 起動直後に「サイレント事前取得」しておく（タイムアウト時に即使える）
  useEffect(() => {
    fetchAiTopicsInternal({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 候補を入力欄に反映
  const pickToInput = (text: string) => setTopic(text);

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
      const { data, error } = await supabase.functions.invoke<SubmitTopicResp>("main-api", {
        body: {
          action: "submit-topic",
          txt,
          tab_id,
        },
      });
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

  // サーバーに直接「この候補で送信」させる版（任意）
  const submitAiTopic = async (index: number) => {
    const tab_id = getTabId();
    if (!tab_id) {
      setErr("tab_id が見つかりません（前画面での保存を確認してください）");
      return;
    }
    setSending(true);
    setErr(null);

    try {
      const { data, error } = await supabase.functions.invoke<AiListResp>("main-api", {
        body: {
          action: "assist-topic-gemini-list",
          tab_id,
          count: 5,
          maxChars: MAX_TOPIC_CHARS,
          submitIndex: index,
        },
      });
      if (error) throw new Error(error.message ?? "送信に失敗しました");
      if (!data?.ok) throw new Error(data?.error ?? "送信に失敗しました");

      const submitted = (data.submitted ?? aiList[index] ?? "").slice(0, MAX_TOPIC_CHARS);
      setTopic(submitted);
      navigate("/parentwaiting", { state: { topic: submitted } });
    } catch (e: any) {
      setErr(e?.message ?? "送信に失敗しました");
    } finally {
      setSending(false);
    }
  };

  // 手入力の送信
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const txt = topic.trim();
    if (!txt || sending) return;
    await submitTopic(txt);
  };

  // タイムアウト時の処理：
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
    // まず画面の aiList から有効なもの
    let candidate = aiList.find(s => isValidTopic(s)) ?? "";

    // それでも無ければサイレント取得→戻り値から即選ぶ
    if (!candidate) {
      const fetched = await fetchAiTopicsInternal({ silent: true });
      candidate = fetched.find(s => isValidTopic(s)) ?? "";
    }

    // なお無ければフォールバック
    if (!candidate) {
      candidate =
        FALLBACK_TOPICS
          .map(s => s.slice(0, MAX_TOPIC_CHARS))
          .find(s => isValidTopic(s)) || "あから始まる楽しいものは？".slice(0, MAX_TOPIC_CHARS);
    }

    candidate = candidate.slice(0, MAX_TOPIC_CHARS);
    await submitTopic(candidate);
  };

  // カウントダウン：0 になったら handleTimeout を発火
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
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      mt={8}
      sx={{ position: "relative", width: "100%" }}
    >
      {/* 画面左上表示：ラウンド */}
      <Box sx={{ position: "absolute", top: 8, left: 12 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
          第 {roundLoading ? "…" : round ?? "—"} ターン
        </Typography>
      </Box>

      <Typography variant="h4" component="h1" gutterBottom>
        あなたは親です
      </Typography>
      <Typography variant="subtitle1" gutterBottom>
        お題を入力してください（{MAX_TOPIC_CHARS}文字以内）
      </Typography>

      <Box
        component="form"
        onSubmit={handleSubmit}
        display="flex"
        alignItems="center"
        gap={2}
        mt={4}
      >
        <TextField
          label="お題入力欄"
          variant="outlined"
          value={topic}
          onChange={(e) => setTopic(e.target.value.slice(0, MAX_TOPIC_CHARS))}
          helperText={`${topic.length}/${MAX_TOPIC_CHARS}`}
        />
        <Button
          type="submit"
          variant="contained"
          disabled={!topic.trim() || sending}
          color="primary"
        >
          {sending ? "送信中…" : "送信"}
        </Button>
      </Box>

      {/* AI候補ブロック */}
      <Box sx={{ mt: 3, width: "min(720px, 92%)" }}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="subtitle1">AI候補</Typography>
          <Button variant="outlined" onClick={fetchAiTopics} disabled={aiLoading}>
            {aiLoading ? "取得中…" : "AI候補を取得"}
          </Button>
        </Stack>

        {/* ★ 表示フラグが true のときだけ見せる */}
        {aiVisible && (
          <>
            {aiErr && (
              <Typography color="error" sx={{ mb: 1 }}>
                {aiErr}
              </Typography>
            )}

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {aiList.map((t, i) => (
                <Stack key={i} direction="row" spacing={1} sx={{ mb: 1 }}>
                  <Chip label={t} onClick={() => pickToInput(t)} />
                  {/* もし「この候補で送信」も見せたいなら↓を有効化
                  <Button size="small" variant="contained" onClick={() => submitAiTopic(i)} disabled={sending}>
                    この候補で送信
                  </Button>
                  */}
                </Stack>
              ))}
            </Stack>
          </>
        )}
      </Box>

      {/* ← ここで残り時間を表示 */}
      <Typography variant="subtitle1" sx={{ mt: 2 }}>
        残り時間: {secondsLeft} 秒
      </Typography>

      {err && (
        <Typography color="error" sx={{ mt: 2 }}>
          {err}
        </Typography>
      )}
    </Box>
  );
};

export default ParentTopicPage;
