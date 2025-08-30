import React, { useEffect, useRef, useState } from 'react';
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
  padding: '0 20px',
  textAlign: 'center',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
};

const POLL_MS = 3000;

function ChildAnswerList() {
  const [answers, setAnswers] = useState<AnswerPair[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // 遷移遅延（★追加）////////////
  const inFlightRef = useRef(false);
  const cancelledRef = useRef(false);
  const routedRef = useRef(false);
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
      // 回答一覧
      const [listRes, decideRes] = await Promise.all([
        supabase.functions.invoke<{ ok: boolean; answers?: AnswerPair[] }>('clever-handler', {
          body: { method: 'list-child-answers' }
        }),
        supabase.functions.invoke<{ ok: boolean; decided?: boolean }>('clever-handler', {
          body: { method: 'is-selection-decided' }
        }),
      ]);

      if (listRes.error) {
        setErrorMsg(listRes.error.message ?? '回答一覧の取得に失敗しました');
      } else if (listRes.data?.ok && Array.isArray(listRes.data.answers)) {
        setAnswers(listRes.data.answers);
      }

      // 決定済みなら 2 秒待ってから遷移（★ここを変更）///////////
      if (!decideRes.error && decideRes.data?.ok && decideRes.data.decided) {
        routedRef.current = true;
        if (timerRef.current) clearTimeout(timerRef.current);  // ポーリング停止
        // 2秒待ってから遷移
        navTimeoutRef.current = setTimeout(() => {
          navigate('/selectedanswer', { replace: true });
        }, 2000);
        return; // 以降の scheduleNext は不要
      }
      //////////////////////////////////////////

    } catch (e: any) {
      setErrorMsg(e?.message ?? '更新中にエラーが発生しました');
    } finally {
      inFlightRef.current = false;
      scheduleNext();
    }
  };

  useEffect(() => {
    cancelledRef.current = false;
    pollOnce();
    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current); // ★追加：遷移タイマーもクリア
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={containerStyle}>
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

