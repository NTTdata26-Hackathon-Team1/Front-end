import React, { useState } from "react";
import Title from "./component/title";
import Card from "./component/card";
import Round from "./component/round";

const TestPage: React.FC = () => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const answers = [
    { user_name: "Aさん", input_QA: "正解は〇〇です" },
    { user_name: "Bさん", input_QA: "△△が答えです" },
    { user_name: "CPU", input_QA: "AIの回答です" },
  ];

  return (
    <div>
      {/* タイトルコンポーネント */}
      <Title text="テストページ" />

      {/* ラウンド数コンポーネント */}
      <Round round={3} loading={false} />

      {/* 回答カードコンポーネント */}
      <div style={{ display: "flex", gap: 16, marginTop: 32 }}>
        {answers.map((a, idx) => (
          <Card
            key={idx}
            userName={a.user_name}
            inputQA={a.input_QA}
            selected={selectedIndex === idx}
            onClick={() => setSelectedIndex(idx)}
          />
        ))}
      </div>
    </div>
  );
};

export default TestPage;