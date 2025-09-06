// src/lib/aiAssist.ts
import { supabase } from "../supabaseClient";

export type AiListResp = { ok: boolean; list?: string[]; submitted?: string; error?: string };

const getTabId = () => sessionStorage.getItem("tab_id") ?? "";

export async function getTopicCandidates(opts?: { count?: number; maxChars?: number }) {
  const tab_id = getTabId();
  const body = { action: "assist-topic-gemini-list", tab_id, count: opts?.count ?? 5, maxChars: opts?.maxChars ?? 16 };
  const { data, error } = await supabase.functions.invoke<AiListResp>("main-api", { body });
  if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? "AI候補の取得に失敗");
  return data.list ?? [];
}

export async function submitTopicCandidate(index: number, opts?: { count?: number; maxChars?: number }) {
  const tab_id = getTabId();
  const body = {
    action: "assist-topic-gemini-list",
    tab_id,
    count: opts?.count ?? 5,
    maxChars: opts?.maxChars ?? 16,
    submitIndex: index,
  };
  const { data, error } = await supabase.functions.invoke<AiListResp>("main-api", { body });
  if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? "AI候補の送信に失敗");
  return data.submitted;
}

export async function getAnswerCandidates(opts?: { count?: number; maxChars?: number }) {
  const tab_id = getTabId();
  const body = { action: "assist-answer-gemini-list", tab_id, count: opts?.count ?? 5, maxChars: opts?.maxChars ?? 12 };
  const { data, error } = await supabase.functions.invoke<AiListResp>("main-api", { body });
  if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? "AI候補の取得に失敗");
  return data.list ?? [];
}

export async function submitAnswerCandidate(index: number, opts?: { count?: number; maxChars?: number }) {
  const tab_id = getTabId();
  const body = {
    action: "assist-answer-gemini-list",
    tab_id,
    count: opts?.count ?? 5,
    maxChars: opts?.maxChars ?? 12,
    submitIndex: index,
  };
  const { data, error } = await supabase.functions.invoke<AiListResp>("main-api", { body });
  if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? "AI候補の送信に失敗");
  return data.submitted;
}
