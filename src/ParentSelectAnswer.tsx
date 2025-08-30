import React, { useEffect, useState, useRef } from 'react'; // ★ useRefを追加
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';

type AnswerPair = { user_name: string; input_QA: string };

const containerStyle: React.CSSProperties = {
  textAlign: 'center',
  marginTop: '20px',
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
  cursor: 'pointer',
  transition: 'border-color 0.2s',
  padding: '0 20px',
  textAlign: 'center',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
};

const selectedAnswerStyle: React.CSSProperties = {
  ...answerStyle,
  border: '2px solid red',
};

const buttonStyle: React.CSSProperties = {
  width: '120px',
  height: '80px',
  fontSize: '1.5rem',
  borderRadius: '20px',
  border: '1px solid #888',
  background: '#f5f5f5',
  cursor: 'pointer',
};

function ParentSelectAnswer() {
  const [answers, setAnswers] = useState<AnswerPair[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const navigate = useNavigate();

  const navTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // ★ 遷移用タイマー

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErrMsg(null);
      try {
        // 候補の取得
        const { data, error } = await supabase.functions.invoke<{ ok: boolean; answers?: AnswerPair[] }>(
          'clever-handler',
          { body: { method: 'list-parent-select-answers' } }
        );
        if (cancelled) return;

        if (error) {
          setErrMsg(error.message ?? '回答一覧の取得に失敗しました');
        } else if (data?.ok && Array.isArray(data.answers)) {
          setAnswers(data.answers);
        } else {
          setAnswers([]);
        }
      } catch (e: any) {
        if (!cancelled) setErrMsg(e?.message ?? '回答一覧の取得に失敗しました（unknown error）');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current); // ★ アンマウント時に必ずクリア
    };
  }, []);

  const handleDecide = async () => {
    if (selectedIndex === null || deciding) return;
    const target = answers[selectedIndex];
    if (!target) return;

    setDeciding(true);
    setErrMsg(null);
    let scheduled = false; // ★ 遷移予約フラグ

    try {
      // 選択確定（total_pt を +1）し、全クライアントへ「選出済み」シグナルを立てる
      const { error } = await supabase.functions.invoke<{ ok: boolean }>(
        'clever-handler',
        {
          body: {
            method: 'mark-selected-answer',
            params: {
              user_name: target.user_name,
              input_QA: target.input_QA,
              round: 1, // ラウンド運用するならパラメタ化
            }
          }
        }
      );

      if (error) {
        setErrMsg(error.message ?? '決定に失敗しました');
      } else {
        // ★ 2秒待ってから結果画面へ
        scheduled = true;
        navTimeoutRef.current = setTimeout(() => {
          navigate('/selectedanswer', { replace: true });
        }, 2000);
      }
    } catch (e: any) {
      setErrMsg(e?.message ?? '決定に失敗しました（unknown error）');
    } finally {
      // ★ 遷移予約済みならボタンはdisabledのままにしておく
      if (!scheduled) setDeciding(false);
    }
  };

  return (
    <div style={containerStyle}>
      <h2 style={titleStyle}>ベストな回答を選択してください</h2>

      {loading && <div style={{ marginBottom: 16 }}>読み込み中…</div>}
      {errMsg && <div style={{ color: 'crimson', marginBottom: 16 }}>{errMsg}</div>}

      <div style={answersStyle}>
        {answers.length > 0 ? (
          answers.map((a, idx) => (
            <div
              key={`${a.user_name}-${idx}`}
              style={selectedIndex === idx ? selectedAnswerStyle : answerStyle}
              onClick={() => setSelectedIndex(idx)}
              title={`${a.user_name} : ${a.input_QA}`}
            >
              <div>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>{`回答${idx + 1}`}</div>
                <div style={{ fontSize: '0.95rem', opacity: 0.9 }}>{`${a.user_name} : ${a.input_QA}`}</div>
              </div>
            </div>
          ))
        ) : (
          !loading && <div style={answerStyle}>（回答がまだありません）</div>
        )}
      </div>

      <button
        style={buttonStyle}
        disabled={selectedIndex === null || deciding}
        onClick={handleDecide}
        title={deciding ? '決定処理中…' : 'この回答で決定する'}
      >
        {deciding ? '決定中…' : '決定'}
      </button>
    </div>
  );
}

export default ParentSelectAnswer;