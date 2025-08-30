import React, { useEffect, useState } from 'react';
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

function SelectedAnswer() {
  const [best, setBest] = useState<AnswerPair | null>(null);
  const [others, setOthers] = useState<AnswerPair[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke<{
          ok: boolean;
          best?: AnswerPair;
          others?: AnswerPair[];
        }>('clever-handler', {
          body: { method: 'get-selected-answer' },
        });

        if (error) {
          setErrorMsg(error.message ?? '取得失敗');
        } else if (data?.ok) {
          setBest(data.best ?? null);
          setOthers(data.others ?? []);
        }
      } catch (e: any) {
        setErrorMsg(e?.message ?? '不明なエラーで取得失敗');
      }
    })();
  }, []);

  return (
    <div style={containerStyle}>
      <h2 style={titleStyle}>ベストな回答に選ばれたのは</h2>

      <div style={answerCardStyle}>
        {best ? `${best.user_name} : ${best.input_QA}` : '（まだ決定していません）'}
      </div>

      <div style={nameListCardStyle}>
        <div>名前のリスト</div>
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
