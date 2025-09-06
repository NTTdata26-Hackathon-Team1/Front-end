import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import DanmakuInput from "./DanmakuInput";
import "./ParentTopicPage.css";

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
    <div className="parenttopick-bg">
      {/* 雲や背景装飾 */}
      <img src="/pixel_cloud_small.png" className="parenttopick-cloud left" alt="cloud" />
      <img src="/pixel_cloud_small.png" className="parenttopick-cloud right2" alt="cloud" />
      <img src="/pixel_cloud_small.png" className="parenttopick-cloud left2" alt="cloud" />
      <img src="/pixel_cloud_small.png" className="parenttopick-cloud right3" alt="cloud" />
      <img src="/pixel_cloud_small.png" className="parenttopick-cloud left3" alt="cloud" />
      <img src="/pixel_girl.png" className="parenttopick-character" alt="character" />
      <img src="/pixel_sunflower.png" className="parenttopick-sunflower" alt="sunflower" />
      <div className="parenttopick-fire-row">
        <img src="/pixel_fire.png" className="parenttopick-fire" alt="fire" />
        <img src="/pixel_fire.png" className="parenttopick-fire" alt="fire" />
        <img src="/pixel_fire.png" className="parenttopick-fire" alt="fire" />
      </div>
      <img src="/pixel_tree_bonsai.png" className="parenttopick-tree-bonsai" alt="tree-bonsai" />

      {/* ラウンド表示 */}
      <div className="parenttopick-round">
        ROUND {roundLoading ? "…" : round ?? "—"}
      </div>


  {/* タイトル・サブタイトル（両方ともparenttopick-titleで2行表示） */}
  <div className="parenttopick-title">あなたは親です</div>
  <div className="parenttopick-subtitle">お題を入力してください</div>


      {/* 入力フォーム */}
      <form className="parenttopick-form" onSubmit={handleSubmit}>
        <input
          className="parenttopick-input"
          type="text"
          placeholder="お題入力欄"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
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


      {/* 残り時間（右上固定） */}
      <div style={{
        position: 'absolute',
        top: '1vw',
        right: '2vw',
        color: '#fff',
        fontWeight: 'bold',
        fontSize: '3vw',
        textShadow: '0.2vw 0.2vw 0 #ff69b4',
        zIndex: 40
      }}>
        残り時間: {secondsLeft} 秒
      </div>

      {/* エラー表示 */}
      {err && (
        <div style={{ color: '#ff3333', marginTop: '1vw', fontWeight: 'bold', fontSize: '1.2vw', textShadow: '0.1vw 0.1vw 0 #fff' }}>
          {err}
        </div>
      )}
      <DanmakuInput fixedBottom />
    </div>
  );
};

export default ParentTopicPage;
