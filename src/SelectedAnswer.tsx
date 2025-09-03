import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';

type AnswerPair = { user_name: string; input_QA: string };
type GetRoundResp = { ok: boolean; round?: number; error?: string };
type GetSelectedAnswerResp = {
  ok: boolean;
  best?: AnswerPair | null;
  others?: AnswerPair[];
  error?: string;
};

const containerStyle: React.CSSProperties = {
  textAlign: 'center',
  marginTop: '20px',
  position: 'relative', // 左上バッジ用
};

const titleStyle: React.CSSProperties = {
  fontSize: '2rem',
  marginBottom: '30px',
  color: '#555',
};

const answerCardStyle: React.CSSProperties = {
  width: '300px',
  height: '180px',
  background: '#eee',
  border: '2px solid #888',
  borderRadius: '40px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '1.5rem',
  margin: '0 auto 30px auto',
  padding: '20px',
  whiteSpace: 'pre-wrap',
  textAlign: 'center',
  lineHeight: 1.5,
};

const nameListCardStyle: React.CSSProperties = {
  width: '350px',
  minHeight: '180px',
  background: '#ddd',
  border: '2px solid #888',
  borderRadius: '20px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'center',
  fontSize: '1.2rem',
  margin: '0 auto 30px auto',
  padding: '20px',
};

const buttonStyle: React.CSSProperties = {
  width: '120px',
  height: '60px',
  fontSize: '1.2rem',
  borderRadius: '20px',
  border: '1px solid #888',
  background: '#f5f5f5',
  cursor: 'pointer',
  margin: '0 auto',
  display: 'block',
};

const roundBadgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: 8,
  left: 12,
  fontWeight: 700,
  color: '#333',
};

// tab_id 解決ヘルパー（localStorage → sessionStorage → URL ?tab_id=）
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

function SelectedAnswer() {
  const [best, setBest] = useState<AnswerPair | null>(null);
  const [others, setOthers] = useState<AnswerPair[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // round 表示用
  const [round, setRound] = useState<number | null>(null);
  const [roundLoading, setRoundLoading] = useState<boolean>(false);

  const navigate = useNavigate();

  // round を main-api / get-round で取得
  const fetchRound = async (tab_id: string) => {
    setRoundLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<GetRoundResp>('main-api', {
        body: { method: 'get-round', params: { tab_id } },
      });
      if (error) {
        setErrorMsg(error.message ?? 'get-round の呼び出しに失敗しました');
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
    (async () => {
      try {
        const tab_id = resolveTabId();
        if (!tab_id) {
          setErrorMsg('tab_id が見つかりませんでした（local/sessionStorage または URL の ?tab_id= を確認してください）');
          return;
        }

        // 左上 round を取得
        fetchRound(tab_id);

        // ベスト回答＆その他を1回だけ取得（※ポーリングなし）
        const { data, error } = await supabase.functions.invoke<GetSelectedAnswerResp>(
          'main-api',
          { body: { method: 'get-selected-answer', params: { tab_id } } }
        );

        if (error) {
          setErrorMsg(error.message ?? '取得失敗');
        } else if (data?.ok) {
          setBest(data.best ?? null);
          setOthers(data.others ?? []);
        } else if (data?.error) {
          setErrorMsg(data.error);
        }
      } catch (e: any) {
        setErrorMsg(e?.message ?? '不明なエラーで取得失敗');
      }
    })();
  }, []);

  return (
    <div style={containerStyle}>
      {/* 左上：ラウンド表示 */}
      <div style={roundBadgeStyle}>
        第 {roundLoading ? '…' : (round ?? '—')} ターン
      </div>

      <h2 style={titleStyle}>ベストな回答に選ばれたのは</h2>

      <div style={answerCardStyle}>
        {best ? `${best.user_name} : ${best.input_QA}` : '（まだ決定していません）'}
      </div>

      <div style={nameListCardStyle}>
        <div>他の人の回答</div>
        <ul style={{ marginTop: '10px', paddingLeft: '20px' }}>
          {others.length > 0 ? (
            others.map((a, idx) => (
              <li key={`${a.user_name}-${idx}`}>
                {`${a.user_name} : ${a.input_QA}`}
              </li>
            ))
          ) : (
            <li>（他の回答なし）</li>
          )}
        </ul>
      </div>

      {errorMsg && (
        <div style={{ color: 'crimson', marginBottom: 16 }}>{errorMsg}</div>
      )}

      <button style={buttonStyle} onClick={() => navigate('/lastanswer')}>
        次へ
      </button>
    </div>
  );
}

export default SelectedAnswer;
