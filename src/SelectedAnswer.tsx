import React from 'react';

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

const names = [
  'Aさん xpt',
  'Bさん xpt',
  '・',
  '・',
];

function SelectedAnswer() {
  return (
    <div style={containerStyle}>
      <h2 style={titleStyle}>ベストな回答に選ばれたのは</h2>
      <div style={answerCardStyle}>回答</div>
      <div style={nameListCardStyle}>
        <div>名前のリスト</div>
        <ul style={{ marginTop: '10px', paddingLeft: '20px' }}>
          {names.map((name, idx) => (
            <li key={idx}>{name}</li>
          ))}
        </ul>
      </div>
      <button style={buttonStyle}>次へ</button>
    </div>
  );
}

export default SelectedAnswer;