import React, { useEffect, useState } from "react";
import { Typography, TextField, Button, Box } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

// sessionStorage から引き継ぎ
const getTabId = () => sessionStorage.getItem("tab_id") ?? "";

type GetRoundResp = { ok: boolean; round?: number; error?: string };
type SubmitTopicResp = { ok: boolean; row?: any; error?: string };

const ParentTopicPage: React.FC = () => {
  const [topic, setTopic] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 左上：ラウンド表示
  const [round, setRound] = useState<number | null>(null);
  const [roundLoading, setRoundLoading] = useState<boolean>(false);

  const navigate = useNavigate();

  // 20秒カウントダウンして自動遷移
  const [secondsLeft, setSecondsLeft] = useState<number>(20);
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          navigate("/parentwaiting");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [navigate]);

  // ページ起動時：time_management を呼ぶ、バックエンドでタイマー管理
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
      // ← 変更点：main-api の submit-topic を呼ぶ（txt と tab_id のみ必要）
      const { data, error } = await supabase.functions.invoke<SubmitTopicResp>(
        "main-api",
        {
          body: {
            action: "submit-topic",
            txt,
            tab_id,
          },
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
        お題を入力してください
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
