import React, { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import './ChildAnswerList.css';
import DanmakuInput from './DanmakuInput';

type AnswerPair = { user_name: string; input_QA: string };
type GetRoundResp = { ok: boolean; round?: number; error?: string };

const POLL_MS = 3000;

// tab_id の取得ヘルパー（localStorage → sessionStorage → URL ?tab_id=）
function resolveTabId(): string | null {
  try {
    const ls = window.localStorage.getItem('tab_id') ?? window.localStorage.getItem('tabId');
    if (ls && ls.trim()) return ls.trim();

    const ss = window.sessionStorage.getItem('tab_id') ?? window.sessionStorage.getItem('tabId');
    if (ss && ss.trim()) return ss.trim();

    const q = new URLSearchParams(window.location.search);
    const fromQuery = (q.get('tab_id') ?? q.get('tabId'))?.trim() || '';
    if (fromQuery) return fromQuery;

    return null;
  } catch {
    return null;
  }
}

function ChildAnswerList() {
  const [answers, setAnswers] = useState<AnswerPair[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 左上：ラウンド表示
  const [round, setRound] = useState<number | null>(null);
  const [roundLoading, setRoundLoading] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const cancelledRef = useRef(false);
  const routedRef = useRef(false);
  const tabIdRef = useRef<string | null>(null); // 取得した tab_id を保持
  const navigate = useNavigate();

  const scheduleNext = () => {
    if (cancelledRef.current || routedRef.current) return;
    timerRef.current = setTimeout(pollOnce, POLL_MS);
  };

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
        setErrorMsg('tab_id が見つかりませんでした（local/sessionStorage または URL の ?tab_id= を確認してください）');
        return;
      }

      // 回答一覧 & 決定済み判定（polling-api）
      const [listRes, decideRes] = await Promise.all([
        supabase.functions.invoke<{ ok: boolean; answers?: AnswerPair[] }>('polling-api', {
          body: { method: 'list-child-answers', tab_id },
        }),
        supabase.functions.invoke<{ ok: boolean; decided?: boolean }>('polling-api', {
          body: { method: 'is-selection-decided', tab_id },
        }),
      ]);

      if (listRes.error) {
        setErrorMsg(listRes.error.message ?? '回答一覧の取得に失敗しました');
      } else if (listRes.data?.ok && Array.isArray(listRes.data.answers)) {
        setAnswers(listRes.data.answers);
      }

      // 決定済みなら 2 秒待ってから遷移
      if (!decideRes.error && decideRes.data?.ok && decideRes.data.decided) {
        routedRef.current = true;
        if (timerRef.current) clearTimeout(timerRef.current); // ポーリング停止
        navTimeoutRef.current = setTimeout(() => {
          navigate('/selectedanswer', { replace: true });
        }, 2000);
        return;
      }
    } catch (e: any) {
      setErrorMsg(e?.message ?? '更新中にエラーが発生しました');
    } finally {
      inFlightRef.current = false;
      scheduleNext();
    }
  };

  // 画面起動時：round を取得して左上に表示（main-api）
  const fetchRound = async () => {
    const tab_id = tabIdRef.current;
    if (!tab_id) {
      setErrorMsg('tab_id が見つかりません（前画面やURLを確認してください）');
      return;
    }
    setRoundLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<GetRoundResp>('main-api', {
        body: { method: 'get-round', params: { tab_id } },
      });
      if (error) {
        setErrorMsg(error.message ?? 'round の取得に失敗しました');
      } else if (!data?.ok || typeof data.round !== 'number') {
        setErrorMsg(data?.error ?? 'round の取得に失敗しました');
      } else {
        setRound(data.round);
      }
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'round の取得に失敗しました（unknown error）');
    } finally {
      setRoundLoading(false);
    }
  };

  useEffect(() => {
    cancelledRef.current = false;
    tabIdRef.current = resolveTabId(); // 初回マウント時に tab_id を確定

    // 左上のラウンド表示を先に取得
    fetchRound();

    // 回答一覧のポーリング開始
    pollOnce();

    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 色分けは行わず、すべて同じカードスタイルで表示します。

  return (
    <div className="childanswerlist-bg">
      {/* 左上：ラウンド表示（pixel-artラベル） */}
      <div className="childanswerlist-round">
        ROUND {roundLoading ? '…' : (round ?? '—')}
      </div>

      {/* タイトル */}
      <h2 className="childanswerlist-title">回答一覧</h2>

      {errorMsg && (
        <div className="childanswerlist-error">{errorMsg}</div>
      )}

      {/* イラスト配置例: 雲・旗・きのこ・キャラなど */}
      <img src="/pixel_cloud_small.png" alt="" className="childanswerlist-cloud-small" />
      <img src="/pixel_cloud_transparent.png" alt="" className="childanswerlist-cloud-transparent" />
      <img src="/pixel_tower.png" alt="" className="childanswerlist-tower" />
      <img src="/pixel_tree.png" alt="" className="childanswerlist-tree" />
      <img src="/pixel_sunflower.png" alt="" className="childanswerlist-sunflower" />
      {/* 回答カード一覧 */}
      <div className="childanswerlist-answers">
        {answers.length > 0 ? (
          answers.map((a, idx) => (
            <div
              key={`${a.user_name}-${idx}`}
              className="childanswerlist-answer"
            >
              <span className="childanswerlist-answer-user">{a.user_name}</span>
              <span className="childanswerlist-answer-sep"> : </span>
              <span className="childanswerlist-answer-text">{a.input_QA}</span>
            </div>
          ))
        ) : (
          <div className="childanswerlist-answer">（まだ回答はありません）</div>
        )}
      </div>
      {/* DanmakuInputを最下部に追加 */}
      <DanmakuInput fixedBottom />
    </div>
  );
}

export default ChildAnswerList;
