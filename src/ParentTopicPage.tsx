import React, { useEffect, useState, useRef } from "react"; // ★ useRef 追加
import { Typography, TextField, Button, Box } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

async function getRandomTopicText(): Promise<string | null> {
  // 件数だけ先に取る（head:true）
  const { count, error: countErr } = await supabase
    .from("topics")
    .select("id", { count: "exact", head: true });

  if (countErr || !count || count <= 0) return null;

  const offset = Math.floor(Math.random() * count);

  // OFFSET 指定で1件だけ取得
  const { data, error } = await supabase
    .from("topics")
    .select("text")
    .order("id", { ascending: true })
    .range(offset, offset);

  if (error || !data || data.length === 0) return null;
  return (data[0].text as string) ?? null;
}

// ★ モックお題（フロントのみ）
const MOCK_TOPICS = [
  "「た」から始まる好きな朝ごはんといえば？",
  "「と」から始まる子どもの頃にハマった遊び",
  "「き」から始まる一度は住んでみたい街",
  "「す」から始まる最近つい課金しちゃったもの",
];

// sessionStorage から引き継ぎ
const getTabId = () => sessionStorage.getItem("tab_id") ?? "";

type GetRoundResp = { ok: boolean; round?: number; error?: string };
type SubmitTopicResp = { ok: boolean; row?: any; error?: string };

const ParentTopicPage: React.FC = () => {
  const [topic, setTopic] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 入力値の最新を参照するためのRef（タイムアウト内で使う）
  const topicRef = useRef(topic); // ★ 追加
  useEffect(() => {
    topicRef.current = topic;
  }, [topic]); // ★ 追加

  // 左上：ラウンド表示
  const [round, setRound] = useState<number | null>(null);
  const [roundLoading, setRoundLoading] = useState<boolean>(false);

  const navigate = useNavigate();

  // 20秒カウントダウン（表示のみ）
  const [secondsLeft, setSecondsLeft] = useState<number>(20);
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ★ 20秒経過時のオート補完＆遷移（DB→fallbackモック）
  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      // 20秒経過時点の入力を確認
      let chosen = topicRef.current.trim();

      if (!chosen) {
        // DB から取得を試す
        const fromDb = await getRandomTopicText();

        if (fromDb && fromDb.trim()) {
          chosen = fromDb.trim();
          setTopic(chosen); // 画面にも反映
        } else {
          // 失敗/空ならモックにフォールバック
          chosen = MOCK_TOPICS[Math.floor(Math.random() * MOCK_TOPICS.length)];
          setTopic(chosen);
        }
      }

      // 次画面へ（親待機）
      navigate("/parentwaiting", { state: { topic: chosen } });
    }, 20_000);

    return () => clearTimeout(timeout);
  }, [navigate]);

  // ページ起動時：time_management を呼ぶ、バックエンドでタイマー管理（現状デバッグのまま）
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.functions.invoke(
        "time_management",
        {
          body: { action: "ping" },
        }
      );
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const txt = topic.trim();
    if (!txt || sending) return;

    const tab_id = getTabId();
    if (!tab_id) {
      setErr("tab_id が見つかりません（前画面での保存を確認してください）");
      return;
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
        setSending(false);
        return;
      }
      if (!data?.ok) {
        setErr(data?.error ?? "送信に失敗しました");
        setSending(false);
        return;
      }

      // 成功したら次の画面へ
      navigate("/parentwaiting", { state: { topic: txt } });
    } catch (e: any) {
      setErr(e?.message ?? "予期せぬエラーが発生しました");
      setSending(false);
    }
  };

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
        お題を入力してください（未入力なら20秒後に自動補完）
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
          onChange={(e) => setTopic(e.target.value)}
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

      {/* 残り時間表示（カウントダウンのみ。遷移はsetTimeout側で実施） */}
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
