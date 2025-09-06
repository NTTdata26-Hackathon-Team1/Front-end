import React, { useState } from "react";
import Title from "./component/title";
import Card from "./component/card";
import Round from "./component/round";
import Form from "./component/form";
import Button from "./component/button";

const TestPage: React.FC = () => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const answers = [
    { user_name: "Aさん", input_QA: "泡（極めてふわふわ）" },
    { user_name: "Bさん", input_QA: "△△が答えです" },
    { user_name: "CPU", input_QA: "AIの回答です" },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setTimeout(() => {
      setSending(false);
      setInput("");
      // ここで送信処理を追加できます
    }, 1000);
  };

  return (
    <div>
      {/* タイトルコンポーネント */}
      <Title text="テストページ" />

      {/* ラウンド数コンポーネント */}
      <Round round={3} loading={false} />
      {/* 入力フォームとボタン */}
      <div >
        <Form
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          disabled={sending}
          maxLength={20}
          placeholder="ここに好きな文字を入力（テスト）"
        >
          <Button
            type="submit"
            disabled={!input.trim() || sending}
          >
            {sending ? "送信中..." : "テスト送信"}
          </Button>
        </Form>
      </div>

      {/* 回答カードコンポーネント */}
      <div style={{ display: "flex", gap: 0, marginTop: 32 }}>
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