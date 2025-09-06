import React, { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import "./ParentWaiting.css";
import DanmakuInput from "./DanmakuInput";
import { useNavigate, useLocation } from "react-router-dom";
import { Typography, Box, CircularProgress } from "@mui/material";

const POLL_MS = 2000; // 2秒おきに確認

// ★ tab_id の取得ヘルパー（localStorage → sessionStorage → URL ?tab_id=）
function resolveTabId(): string | null {
  try {
    const ls =
      window.localStorage.getItem("tab_id") ??
      window.localStorage.getItem("tabId");
    if (ls && ls.trim()) return ls.trim();

    const ss =
      window.sessionStorage.getItem("tab_id") ??
      window.sessionStorage.getItem("tabId");
    if (ss && ss.trim()) return ss.trim();

    const q = new URLSearchParams(window.location.search);
    const fromQuery = (q.get("tab_id") ?? q.get("tabId"))?.trim() || "";
    if (fromQuery) return fromQuery;

    return null;
  } catch {
    return null;
  }
}

type GetRoundResp = { ok: boolean; round?: number; error?: string };
type Src = "db" | "mock" | "manual";
type NavState = { topic?: string; source?: Src };

const ParentWaiting: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const navState = (location.state ?? {}) as NavState;

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ラウンド表示
  const [round, setRound] = useState<number | null>(null);
  const [roundLoading, setRoundLoading] = useState<boolean>(false);

  // お題表示
  const [debugTopic, setDebugTopic] = useState<string>("");
  const [debugSource, setDebugSource] = useState<Src | undefined>(undefined);

  // refs
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const cancelledRef = useRef(false);
  const routedRef = useRef(false); // 遷移したらポーリング停止
  const tabIdRef = useRef<string | null>(null); // tab_id を保持

  // ポーリングの次回予約
  const scheduleNext = () => {
    if (cancelledRef.current || routedRef.current) return;
    timerRef.current = setTimeout(pollOnce, POLL_MS);
  };

  // 1回分のポーリング
  const pollOnce = async () => {
    if (cancelledRef.current || inFlightRef.current || routedRef.current) {
      scheduleNext();
      return;
    }
    inFlightRef.current = true;
    setErrorMsg(null);

    try {
      const tab_id = tabIdRef.current;
      if (!tab_id) {
        setErrorMsg(
          "tab_id が見つかりませんでした（local/sessionStorage または URL の ?tab_id= を確認してください）"
        );
        return;
      }

      // are-children-answers-complete を polling-api に投げる（tab_id を渡す）
      const { data, error } = await supabase.functions.invoke<{
        ok: boolean;
        ready?: boolean;
        a?: number;
        b?: number;
      }>("polling-api", {
        body: { method: "are-children-answers-complete", tab_id },
      });

      if (error) {
        setErrorMsg(error.message ?? "確認中にエラーが発生しました");
      } else if (data?.ok && data.ready) {
        // すべての子回答が揃った → 次のページへ
        routedRef.current = true;
        if (timerRef.current) clearTimeout(timerRef.current);
        navigate("/parentselectanswer");
        return;
      }
    } catch (e: any) {
      setErrorMsg(
        e?.message ?? "確認中にエラーが発生しました（unknown error）"
      );
    } finally {
      inFlightRef.current = false;
      scheduleNext();
    }
  };

  // ★ 画面起動時に round を取得して左上に表示
  const fetchRound = async () => {
    const tab_id = tabIdRef.current;
    if (!tab_id) {
      setErrorMsg(
        "tab_id が見つかりませんでした（local/sessionStorage または URL の ?tab_id= を確認してください）"
      );
      return;
    }
    setRoundLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<GetRoundResp>(
        "main-api",
        {
          body: { method: "get-round", params: { tab_id } },
        }
      );
      if (error) {
        setErrorMsg(error.message ?? "get-round の呼び出しに失敗しました");
      } else if (!data?.ok || typeof data.round !== "number") {
        setErrorMsg(data?.error ?? "round の取得に失敗しました");
      } else {
        setRound(data.round);
      }
    } catch (e: any) {
      setErrorMsg(e?.message ?? "round の取得に失敗しました（unknown error）");
    } finally {
      setRoundLoading(false);
    }
  };

  // ★ 追加：まずDBから現在ラウンドのお題を取れないか試す
  async function tryLoadTopicFromDbFirst(tab_id: string) {
    const { data, error } = await supabase.functions.invoke<{
      ok: boolean;
      topic_text?: string;
    }>("main-api", {
      body: { method: "get-topic", params: { tab_id } },
    });

    if (!error && data?.ok && data.topic_text) {
      setDebugTopic(data.topic_text);
      setDebugSource("db");
      try {
        sessionStorage.setItem("last_topic", data.topic_text);
        sessionStorage.setItem("last_topic_source", "db");
      } catch {}
      return true; // DBから取れた
    }
    return false; // 取れなかった
  }

  // ★ 追加：お題ロック用の関数（Edge Function呼び出し版）
  async function lockTopicToRound_viaFunction({
    tab_id,
    topic_text,
  }: {
    tab_id: string;
    topic_text: string;
  }) {
    const { data, error } = await supabase.functions.invoke<{
      ok: boolean;
      round_id?: string;
      alreadyLocked?: boolean;
      error?: string;
    }>("main-api", {
      body: {
        method: "lock-topic",
        params: { tab_id, topic_text },
      },
    });

    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error ?? "lock-topic failed");
    return data;
  }

  // ★ お題（topic）を navState > sessionStorage の優先度で読み込み
  useEffect(() => {
    if (navState?.topic && navState.topic.length > 0) {
      setDebugTopic(navState.topic);
      setDebugSource(navState.source);
      // 戻った時の保険にキャッシュ
      try {
        sessionStorage.setItem("last_topic", navState.topic);
        if (navState.source)
          sessionStorage.setItem("last_topic_source", navState.source);
      } catch {}
    } else {
      try {
        const cached = sessionStorage.getItem("last_topic") || "";
        const cachedSrc =
          (sessionStorage.getItem("last_topic_source") as Src | null) ?? null;
        setDebugTopic(cached);
        setDebugSource(cachedSrc ?? undefined);
      } catch {}
    }
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ★ tab_id確定 → round取得 → ポーリング開始（置き換え版）
  useEffect(() => {
    cancelledRef.current = false;
    tabIdRef.current = resolveTabId(); // 初回に tab_id を確定

    const tab_id = tabIdRef.current;

    // 左上ラウンド表示の初期化 + ポーリング開始は共通でやる
    const kickBasics = () => {
      fetchRound();
      pollOnce();
    };

    // まずDB優先で現在お題を試し取得 → だめなら従来フロー続行
    if (tab_id) {
      tryLoadTopicFromDbFirst(tab_id)
        .catch(() => {}) // 失敗は無視
        .finally(kickBasics);
    } else {
      kickBasics();
    }

    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ★ 追加：二重実行防止
  const lockedOnceRef = useRef(false);

  // ★ debugTopic が決まったら一度だけロック（追記あり）
  useEffect(() => {
    (async () => {
      if (lockedOnceRef.current) return;
      if (!debugTopic || !debugTopic.trim()) return;

      const tab_id = tabIdRef.current;
      if (!tab_id) return;

      try {
        await lockTopicToRound_viaFunction({
          tab_id,
          topic_text: debugTopic.trim(),
        });
        lockedOnceRef.current = true;

        // ★★ ここから3行を追記：成功したら取得元＝DBに寄せる
        setDebugSource("db");
        try {
          sessionStorage.setItem("last_topic", debugTopic.trim());
          sessionStorage.setItem("last_topic_source", "db");
        } catch {}
        // ★★ ここまで
      } catch (e: any) {
        console.error("lock-topic failed:", e?.message ?? e);
        setErrorMsg(e?.message ?? "お題の確定に失敗しました");
      }
    })();
  }, [debugTopic]);

  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      mt={8}
      sx={{ position: "relative", width: "100%" }}
    >
      {/* 左上のラウンド表示 */}
      <Box sx={{ position: "absolute", top: 8, left: 12 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
          第 {roundLoading ? "…" : round ?? "—"} ターン
        </Typography>
      </Box>

      <Typography variant="h4" gutterBottom>
        回答入力中です
      </Typography>

      <CircularProgress size={80} />

      <Box mt={3}>
        <Typography variant="subtitle1" sx={{ opacity: 0.7 }}>
          今回のお題
        </Typography>
        <Typography variant="h5" sx={{ mt: 1 }}>
          {debugTopic || "—（未設定）"}
        </Typography>
        {debugSource && (
          <Typography variant="body2" sx={{ mt: 1, opacity: 0.7 }}>
            取得元:{" "}
            {debugSource === "db"
              ? "DB"
              : debugSource === "mock"
              ? "モック"
              : "手動"}
          </Typography>
        )}
      </Box>

      {/* 使うならここで弾幕入力 */}
      {/* <DanmakuInput fixedBottom /> */}

      {errorMsg && (
        <Typography color="error" sx={{ mt: 2 }}>
          {errorMsg}
        </Typography>
      )}
    </Box>
  );
};

export default ParentWaiting;
