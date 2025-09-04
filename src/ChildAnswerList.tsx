import React, { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';

type AnswerPair = { user_name: string; input_QA: string };
type GetRoundResp = { ok: boolean; round?: number; error?: string };

const containerStyle: React.CSSProperties = {
  textAlign: 'center',
  marginTop: '20px',
  position: 'relative', // 左上ラベルを載せるため
};

const titleStyle: React.CSSProperties = {
  fontSize: '2rem',
  marginBottom: '30px',
  color: '#555',
};

const answersStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  gap: '40px 40px',
  marginBottom: '40px',
};

const answerStyle: React.CSSProperties = {
  width: '300px',
  height: '180px',
  background: '#eee',
  border: '2px solid #888',
  borderRadius: '40px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '1.2rem',
  padding: '0 20px',
  textAlign: 'center',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
};

const roundBadgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: 8,
  left: 12,
  fontWeight: 700,
  color: '#333',
};

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

  return (
    <div style={containerStyle}>
      {/* 左上：ラウンド表示 */}
      <div style={roundBadgeStyle}>
        第 {roundLoading ? '…' : (round ?? '—')} ターン
      </div>

      <h2 style={titleStyle}>回答一覧</h2>

      {errorMsg && (
        <div style={{ color: 'crimson', marginBottom: 16 }}>{errorMsg}</div>
      )}

      <div style={answersStyle}>
        {answers.length > 0 ? (
          answers.map((a, idx) => (
            <div key={`${a.user_name}-${idx}`} style={answerStyle}>
              {`${a.user_name} : ${a.input_QA}`}
            </div>
          ))
        ) : (
          <div style={answerStyle}>（まだ回答はありません）</div>
        )}
      </div>
    </div>
  );
}

export default ChildAnswerList;
