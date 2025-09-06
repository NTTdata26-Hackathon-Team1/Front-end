import React from "react";
import { supabase } from "./supabaseClient"; // ← 追加

// ---- API型 ----
type ApiResultItem = { rank: number; user_name: string; pt: number };
type GetResultResp = { ok: boolean; results?: ApiResultItem[]; error?: string };

// ---- tab_id 解決ヘルパー（既存の実装と同等）----
function resolveTabId(): string | null {
  try {
    const ls = window.localStorage.getItem("tab_id") ?? window.localStorage.getItem("tabId");
    if (ls && ls.trim()) return ls.trim();

    const ss = window.sessionStorage.getItem("tab_id") ?? window.sessionStorage.getItem("tabId");
    if (ss && ss.trim()) return ss.trim();

    const q = new URLSearchParams(window.location.search);
    const fromQuery = (q.get("tab_id") ?? q.get("tabId"))?.trim() || "";
    if (fromQuery) return fromQuery;
  } catch { }
  return null;
}

// キラキラエフェクト用のコンポーネント
const Sparkle: React.FC<{ style: React.CSSProperties }> = ({ style }) => (
  <span
    style={{
      position: "absolute",
      width: 12,
      height: 12,
      pointerEvents: "none",
      ...style,
    }}
  >
    <svg width="12" height="12" viewBox="0 0 12 12">
      <g>
        <polygon
          points="6,0 7,5 12,6 7,7 6,12 5,7 0,6 5,5"
          fill="#ffe066"
          opacity="0.85"
        />
      </g>
    </svg>
  </span>
);

// 🎉エフェクト用の紙吹雪
const Confetti: React.FC<{ style: React.CSSProperties }> = ({ style }) => (
  <span
    style={{
      position: "absolute",
      width: 10,
      height: 18,
      pointerEvents: "none",
      ...style,
    }}
  >
    <svg width="10" height="18" viewBox="0 0 10 18">
      <ellipse
        cx="5"
        cy="9"
        rx="4"
        ry="7"
        fill={["#ff512f", "#ffd700", "#dd2476", "#00c3ff", "#fff700"][
          Math.floor(Math.random() * 5)
        ]}
        opacity="0.8"
      />
    </svg>
  </span>
);

const getRankIcon = (rank: number) => {
  switch (rank) {
    case 1:
      return "🥇";
    case 2:
      return "🥈";
    case 3:
      return "🥉";
    default:
      return "";
  }
};

const LastAnswer: React.FC = () => {
  const [isPressed, setIsPressed] = React.useState(false);

  // APIから取得してUIに流すための state（name/score で保持）
  const [results, setResults] = React.useState<{ name: string; score: number }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // キラキラの位置・動き
  const [sparkles, setSparkles] = React.useState<
    { left: number; top: number; delay: number; duration: number }[]
  >([]);
  // 紙吹雪の位置・動き
  const [confettis, setConfettis] = React.useState<
    { left: number; top: number; delay: number; duration: number; side: "left" | "right" }[]
  >([]);

  // 起動時：演出の初期化（従来どおり）
  React.useEffect(() => {
    const newSparkles = Array.from({ length: 18 }).map(() => ({
      left: Math.random() * 100,
      top: Math.random() * 30 + 5,
      delay: Math.random() * 2,
      duration: 1.5 + Math.random() * 1.5,
    }));
    setSparkles(newSparkles);

    const newConfettis = Array.from({ length: 18 }).map((_, i) => ({
      left: i % 2 === 0 ? Math.random() * 8 + 2 : 92 + Math.random() * 6,
      top: Math.random() * 10 + 2,
      delay: Math.random() * 1.5,
      duration: 1.2 + Math.random() * 1.5,
      side: (i % 2 === 0 ? "left" : "right") as "left" | "right",
    }));
    setConfettis(newConfettis);
  }, []);

  // 起動時：tab_id を使って only-once-api/get-result を呼ぶ
  React.useEffect(() => {
    (async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const tab_id = resolveTabId();
        if (!tab_id) {
          setErrorMsg("tab_id が見つかりません（local/sessionStorage または URL の ?tab_id= を確認）");
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.functions.invoke<GetResultResp>(
          "only-once-api",
          { body: { method: "get-result", params: { tab_id } } }
        );

        if (error) {
          setErrorMsg(error.message ?? "get-result の呼び出しに失敗しました");
        } else if (!data?.ok || !Array.isArray(data.results)) {
          setErrorMsg(data?.error ?? "結果の形式が不正です");
        } else {
          // rank の昇順で 1〜3位を使用し、UI用の {name, score} に変換
          const top3 = [...data.results]
            .sort((a, b) => a.rank - b.rank)
            .slice(0, 3)
            .map((r) => ({ name: r.user_name, score: r.pt }));

          setResults(top3);
        }
      } catch (e: any) {
        setErrorMsg(e?.message ?? "不明なエラーが発生しました");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handlePlayAgain = () => {
    setIsPressed(true);
    setTimeout(() => {
      setIsPressed(false);
      window.location.reload();
    }, 120);
  };

  // 表示用：rank 1→3 の順で並べる（APIがrank付与なので score ソートは不要）
  const display = results;

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        height: "100vh",
        color: "#222",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Segoe UI', 'Roboto', 'Arial', sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* キラキラエフェクト */}
      <div style={{ position: "absolute", width: "100%", top: 0, left: 0, pointerEvents: "none" }}>
        {sparkles.map((s, i) => (
          <Sparkle
            key={i}
            style={{
              left: `${s.left}%`,
              top: `${s.top}vh`,
              animation: `sparkle-move ${s.duration}s ${s.delay}s infinite linear`,
              zIndex: 2,
            }}
          />
        ))}
      </div>
      {/* 🎉紙吹雪エフェクト */}
      <div style={{ position: "absolute", width: "100%", top: 0, left: 0, pointerEvents: "none" }}>
        {confettis.map((c, i) => (
          <Confetti
            key={i}
            style={{
              left: `${c.left}%`,
              top: `${c.top}vh`,
              animation: `confetti-fall-${c.side} ${c.duration}s ${c.delay}s infinite cubic-bezier(.6,.2,.4,1.1)`,
              zIndex: 2,
            }}
          />
        ))}
      </div>

      {/* タイトル */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: "1.5rem", position: "relative", zIndex: 3 }}>
        <span
          style={{
            fontSize: "2.5rem",
            marginRight: "0.5em",
            position: "relative",
            animation: "pop-left 1.2s cubic-bezier(.7,-0.2,.6,1.5) infinite alternate",
            display: "inline-block",
          }}
        >
          🎉
        </span>
        <h1
          style={{
            fontSize: "3rem",
            letterSpacing: "0.1em",
            margin: 0,
            textShadow: "0 4px 24px #eee, 0 1px 0 #fff",
            fontWeight: 900,
            color: "#222",
            position: "relative",
            zIndex: 3,
          }}
        >
          ゲーム終了！
        </h1>
        <span
          style={{
            fontSize: "2.5rem",
            marginLeft: "0.5em",
            position: "relative",
            animation: "pop-right 1.2s cubic-bezier(.7,-0.2,.6,1.5) infinite alternate",
            display: "inline-block",
          }}
        >
          🎉
        </span>
      </div>

      <h2
        style={{
          fontSize: "2rem",
          marginBottom: "2rem",
          fontWeight: 700,
          textShadow: "0 2px 8px #ddd",
          zIndex: 3,
        }}
      >
        最終結果発表
      </h2>

      {/* 取得エラー表示 */}
      {errorMsg && (
        <div style={{ color: "crimson", marginBottom: 16, zIndex: 3 }}>{errorMsg}</div>
      )}

      <div
        style={{
          background: "linear-gradient(135deg, #232526 0%, #414345 100%)",
          borderRadius: "20px",
          padding: "2rem 3rem",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          minWidth: "350px",
          zIndex: 3,
        }}
      >
        {loading ? (
          // 簡易ローディング（3行のプレースホルダ）
          [1, 2, 3].map((rank) => (
            <div
              key={`sk-${rank}`}
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: "1.2rem",
                fontSize: rank === 1 ? "1.7rem" : "1.2rem",
                color: "#fff",
                background: "rgba(255,255,255,0.08)",
                borderRadius: "12px",
                padding: "0.7em 1.2em",
                opacity: 0.6,
              }}
            >
              <span style={{ width: 40, display: "inline-block", fontSize: "2rem" }}>
                {getRankIcon(rank)}
              </span>
              <span style={{ flex: 1 }}>読み込み中…</span>
              <span style={{ fontWeight: 700, marginLeft: 16 }}>— pt</span>
            </div>
          ))
        ) : (
          display.map((player, idx) => (
            <div
              key={`${player.name}-${idx}`}
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: "1.2rem",
                fontSize: idx === 0 ? "1.7rem" : "1.2rem",
                fontWeight: idx === 0 ? 700 : 500,
                color:
                  idx === 0 ? "#FFD700" : idx === 1 ? "#C0C0C0" : idx === 2 ? "#CD7F32" : "#fff",
                letterSpacing: "0.05em",
                textShadow: idx === 0 ? "0 2px 8px #FFD700" : "0 1px 2px #000",
                background:
                  idx === 0
                    ? "linear-gradient(90deg, #ffefba 0%, #ffffff 100%)"
                    : idx === 1
                      ? "linear-gradient(90deg, #e0e0e0 0%, #f5f5f5 100%)"
                      : idx === 2
                        ? "linear-gradient(90deg, #f7d9c4 0%, #fff 100%)"
                        : "rgba(255,255,255,0.08)",
                borderRadius: "12px",
                padding: "0.7em 1.2em",
                marginTop: idx === 0 ? 0 : "0.5em",
                boxShadow: idx === 0 ? "0 2px 12px #ffd70044" : "0 1px 4px #0002",
              }}
            >
              <span style={{ width: 40, display: "inline-block", fontSize: "2rem" }}>
                {getRankIcon(idx + 1)}
              </span>
              <span style={{ flex: 1 }}>{player.name}</span>
              <span style={{ fontWeight: 700, marginLeft: 16 }}>{player.score} pt</span>
            </div>
          ))
        )}
      </div>

      <button
        style={{
          marginTop: "2.5rem",
          padding: "0.8rem 2.5rem",
          fontSize: "1.2rem",
          borderRadius: "999px",
          border: "none",
          background: isPressed
            ? "linear-gradient(90deg, #dd2476 0%, #ff512f 100%)"
            : "linear-gradient(90deg, #ff512f 0%, #dd2476 100%)",
          color: "#fff",
          fontWeight: 700,
          boxShadow: "0 4px 16px rgba(255,81,47,0.12)",
          cursor: "pointer",
          transition: "transform 0.1s, background 0.2s",
          transform: isPressed ? "scale(0.96)" : "scale(1)",
          outline: "none",
          zIndex: 3,
        }}
        onMouseDown={() => setIsPressed(true)}
        onMouseUp={() => setIsPressed(false)}
        onMouseLeave={() => setIsPressed(false)}
        onClick={handlePlayAgain}
      >
        もう一遊ぶ
      </button>

      {/* tree_bonsai画像を2つ追加（左下・右下） */}
      <img
        src={process.env.PUBLIC_URL + '/pixel_tree_bonsai.png'}
        alt="bonsai-left"
        style={{
          position: 'fixed',
          bottom: '8vw',
          left: '2vw',
          width: '25vw',
          height: 'auto',
          zIndex: 10,
        }}
      />
      <img
        src={process.env.PUBLIC_URL + '/pixel_tree_bonsai.png'}
        alt="bonsai-right"
        style={{
          position: 'fixed',
          bottom: '8vw',
          right: '2vw',
          width: '25vw',
          height: 'auto',
          zIndex: 10,
        }}
      />

      {/* sunflower画像を2つ追加（左下・右下、bonsaiの横） */}
      <img
        src={process.env.PUBLIC_URL + '/pixel_sunflower.png'}
        alt="sunflower-left"
        style={{
          position: 'fixed',
          bottom: '8vw',
          left: '30vw',
          width: '3vw',
          height: 'auto',
          zIndex: 10,
        }}
      />
      <img
        src={process.env.PUBLIC_URL + '/pixel_sunflower.png'}
        alt="sunflower-right"
        style={{
          position: 'fixed',
          bottom: '8vw',
          right: '30vw',
          width: '3vw',
          height: 'auto',
          zIndex: 10,
        }}
      />

      {/* アニメーションCSS */}
      <style>
        {`
        @keyframes pop-left {
          0% { transform: scale(1) rotate(-10deg);}
          60% { transform: scale(1.25) rotate(-20deg);}
          100% { transform: scale(1) rotate(-10deg);}
        }
        @keyframes pop-right {
          0% { transform: scale(1) rotate(10deg);}
          60% { transform: scale(1.25) rotate(20deg);}
          100% { transform: scale(1) rotate(10deg);}
        }
        @keyframes sparkle-move {
          0% { opacity: 0; transform: scale(0.7) translateY(0);}
          10% { opacity: 1;}
          80% { opacity: 1;}
          100% { opacity: 0; transform: scale(1.2) translateY(40px);}
        }
        @keyframes confetti-fall-left {
          0% { opacity: 0; transform: rotate(-30deg) translateY(0);}
          10% { opacity: 1;}
          80% { opacity: 1;}
          100% { opacity: 0; transform: rotate(20deg) translateY(80px);}
        }
        @keyframes confetti-fall-right {
          0% { opacity: 0; transform: rotate(30deg) translateY(0);}
          10% { opacity: 1;}
          80% { opacity: 1;}
          100% { opacity: 0; transform: rotate(-20deg) translateY(80px);}
        }
        `}
      </style>
    </div>
  );
};

export default LastAnswer;
