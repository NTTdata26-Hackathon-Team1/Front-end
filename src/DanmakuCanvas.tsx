// src/DanmakuCanvas.tsx
import React, {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from "react";

export type DanmakuCanvasHandle = {
  push: (text: string) => void;
};

type Bullet = {
  id: number;
  text: string;
  x: number;         // 現在のX座標（px）
  y: number;         // ベースラインY（px）
  width: number;     // 文字列幅（px）
  speed: number;     // 速度（px/sec）
  color: string;     // 色
  lane: number;      // レーン番号
};

type Props = {
  /** 文字の基本サイズ */
  fontSize?: number;        // default 24
  /** 最大レーン数（行数） */
  maxLanes?: number;        // default 8
  /** 弾幕の最小間隔（同一レーンでの前後距離） */
  minGap?: number;          // default 50
  /** 背景透過（親の上に重ねる想定） */
  transparent?: boolean;    // default true
};

const DanmakuCanvas = forwardRef<DanmakuCanvasHandle, Props>(function DanmakuCanvas(
  { fontSize = 24, maxLanes = 8, minGap = 50, transparent = true },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bulletsRef = useRef<Bullet[]>([]);
  const lastTimeRef = useRef<number>(0);
  const idRef = useRef<number>(1);
  const lanesLastBulletRef = useRef<(Bullet | null)[]>(Array(maxLanes).fill(null));
  const fontRef = useRef<string>(`bold ${fontSize}px sans-serif`);
  const runningRef = useRef<boolean>(true);

  // Canvasサイズをデバイスピクセル比に合わせてリサイズ
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.font = fontRef.current;
      ctx.textBaseline = "alphabetic";
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 2;
    }
  }, []);

  useEffect(() => {
    resizeCanvas();
    const onResize = () => resizeCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [resizeCanvas]);

  // タブ非表示時はループを止めてCPU節約
  useEffect(() => {
    const onVisibility = () => {
      runningRef.current = document.visibilityState !== "hidden";
      // 復帰直後のΔt暴発防止
      lastTimeRef.current = performance.now();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // 弾幕追加
  const push = useCallback((text: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 文字幅を計測
    ctx.font = fontRef.current;
    const width = Math.ceil(ctx.measureText(text).width);

    // レーンを選ぶ（前の弾と十分離れているレーンを優先）
    const lanes = lanesLastBulletRef.current;
    const rect = canvas.getBoundingClientRect();
    const viewW = rect.width;

    const candidates: number[] = [];
    for (let lane = 0; lane < lanes.length; lane++) {
      const last = lanes[lane];
      if (!last) {
        candidates.push(lane);
        continue;
      }
      // 右端スタート（viewW）時点で、同レーンの最後尾との距離がminGap以上になるかチェック
      // 距離 ≈ last.x + last.width - viewW
      if (last.x + last.width - viewW < -minGap) {
        candidates.push(lane);
      }
    }
    const lane =
      candidates.length > 0
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : Math.floor(Math.random() * lanes.length);

    // 速度（可読性のため最小・最大を制限）
    // 文字数が長いほど速く（画面滞在時間を揃えやすい）
    const base = 120;        // px/sec
    const perChar = 6;       // px/sec per char
    const speed = Math.min(420, Math.max(90, base + perChar * text.length));

    const lineHeight = fontSize * 1.2;
    const y = lineHeight * (lane + 1); // baseline

    const b: Bullet = {
      id: idRef.current++,
      text,
      x: viewW,
      y,
      width,
      speed,
      color: randomColor(),
      lane,
    };
    bulletsRef.current.push(b);
    lanes[lane] = b; // 同レーンの最後尾更新
  }, [fontSize, minGap]);

  useImperativeHandle(ref, () => ({ push }), [push]);

  // メインループ
  useEffect(() => {
    let raf = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (!runningRef.current) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const viewW = rect.width;
      const viewH = rect.height;

      const last = lastTimeRef.current || t;
      const dt = (t - last) / 1000; // sec
      lastTimeRef.current = t;

      // 進める
      const bullets = bulletsRef.current;
      for (const b of bullets) {
        b.x -= b.speed * dt;
      }

      // 画面外（左に出た）弾を除去
      for (let i = bullets.length - 1; i >= 0; i--) {
        if (bullets[i].x + bullets[i].width < 0) {
          bullets.splice(i, 1);
        }
      }

      // 背景クリア
      ctx.clearRect(0, 0, viewW, viewH);

      // 描画
      ctx.font = fontRef.current;
      for (const b of bullets) {
        ctx.fillStyle = b.color;
        ctx.fillText(b.text, b.x, b.y);
      }
    };

    lastTimeRef.current = performance.now();
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        background: transparent ? "transparent" : "rgba(0,0,0,0.2)",
        pointerEvents: "none", // クリックを下のUIに透過
      }}
    />
  );
});

export default DanmakuCanvas;

// 適度に読みやすい明るめ色をランダム
function randomColor() {
  const colors = [
    "#ffffff", "#ffd166", "#06d6a0", "#4cc9f0",
    "#f72585", "#bdb2ff", "#caffbf", "#ffadad",
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}
