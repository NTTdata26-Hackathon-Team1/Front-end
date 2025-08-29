import React, { useEffect, useState } from 'react';

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
  fontSize: '1.5rem',
};

function ChildAnswerList() {
  const [answers, setAnswers] = useState<string[]>([]);

  useEffect(() => {
    // ダミーデータ（本番はfetchでAPIから取得）
    setTimeout(() => {
      setAnswers([
        '回答1',
        '回答2',
        '回答3',
        '回答4',
        // ...人数や内容はAPI次第
      ]);
    }, 500);
  }, []);

  return (
    <div style={containerStyle}>
      <h2 style={titleStyle}>回答一覧</h2>
      <div style={answersStyle}>
        {answers.map((answer, idx) => (
          <div key={idx} style={answerStyle}>
            {answer}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ChildAnswerList;