import React, { createContext, useContext, useEffect, useRef } from "react";
import DanmakuCanvas, { DanmakuCanvasHandle } from "./DanmakuCanvas";
import { supabase } from "./supabaseClient";

type Ctx = { pushLocal: (text: string) => void; send: (text: string) => Promise<void> };
const DanmakuCtx = createContext<Ctx | null>(null);
export const useDanmaku = () => {
  const v = useContext(DanmakuCtx);
  if (!v) throw new Error("useDanmaku must be used inside <DanmakuProvider />");
  return v;
};

// タブ単位の client_id
function ensureClientId() {
  const key = "danmaku_client_id";
  let id = sessionStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(key, id); }
  return id;
}

const DanmakuProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const ref = useRef<DanmakuCanvasHandle | null>(null);
  const clientId = ensureClientId();

  // 直近に表示した id を記録して重複表示を防ぐ（初期ロード＋Realtimeの両方に効く）
  const seenIds = useRef<Set<string>>(new Set());

  // 最後に購読がアクティブになった時刻（再接続キャッチアップ用）
  const sinceRef = useRef<string | null>(null);

  const pushLocal = (text: string) => ref.current?.push(text);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t) return;
    // 楽観描画（自分は即時表示）
    ref.current?.push(t);
    const { error } = await supabase.from("danmaku").insert({ text: t, client_id: clientId });
    if (error) console.error("[danmaku] insert error:", error);
  };

  // 1件を描画（重複防止つき）
  const drawRow = (row: { id: string; text: string }) => {
    if (!row?.id || seenIds.current.has(row.id)) return;
    seenIds.current.add(row.id);
    ref.current?.push(row.text);
  };

  // 抜け漏れのキャッチアップ
  const catchUp = async () => {
    const since = sinceRef.current;
    if (!since) return;
    const { data, error } = await supabase
      .from("danmaku")
      .select("id, text, created_at")
      .gt("created_at", since)               // この時刻“より後”を取る
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) {
      console.warn("[danmaku] catchUp error:", error);
      return;
    }
    data?.forEach(drawRow);
  };

  useEffect(() => {
    // 1) まず購読を開始（ここから since を刻む）
    const channel = supabase
      .channel("danmaku:ALL")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "danmaku" },
        (payload) => {
          const row = (payload as any).new as { id: string; text: string; client_id?: string; created_at?: string };
          // 自分由来はスキップ（上で楽観描画済み）
          if (row.client_id && row.client_id === clientId) return;
          drawRow(row);
        }
      )
      .subscribe(async (status) => {
        console.log("[danmaku] status:", status);
        if (status === "SUBSCRIBED") {
          // この瞬間を since として記録（ISO文字列）
          sinceRef.current = new Date().toISOString();
          // 初期ロード（古い順で50件）
          const { data, error } = await supabase
            .from("danmaku")
            .select("id, text, created_at")
            .order("created_at", { ascending: false })
            .limit(0);
          if (!error && data) [...data].reverse().forEach(drawRow);
          else if (error) console.warn("[danmaku] initial select error:", error);
        }
        // 再接続のたびにキャッチアップ
        if (status === "SUBSCRIBED") {
          await catchUp();
        }
      });

    // 2) ネットワーク回復時にもキャッチアップ
    const onOnline = () => catchUp();
    window.addEventListener("online", onOnline);

    return () => {
      window.removeEventListener("online", onOnline);
      supabase.removeChannel(channel);
    };
  }, [clientId]);

  return (
    <DanmakuCtx.Provider value={{ pushLocal, send }}>
      {children}
      <div style={{ position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "none" }}>
        <DanmakuCanvas ref={ref} fontSize={28} maxLanes={10} />
      </div>
    </DanmakuCtx.Provider>
  );
};

export default DanmakuProvider;
