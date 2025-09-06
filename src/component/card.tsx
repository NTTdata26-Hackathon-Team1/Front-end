import React from "react";

type CardProps = {
  userName: string;
  inputQA: string;
  selected: boolean;
  onClick: () => void;
};

const Card: React.FC<CardProps> = ({
  userName,
  inputQA,
  selected,
  onClick,
}) => (
  <div
    className={`parentselectanswer-answer${selected ? " selected" : ""}`}
    onClick={onClick}
    title={`${userName} : ${inputQA}`}
    style={{
      background: "#7F9BE4",
      color: "#fff",
      cursor: "pointer",
      borderRadius: 12,
      padding: "16px 20px",
      boxShadow: selected ? "0 0 0 4px #f52ba7" : "0 2px 8px rgba(0,0,0,0.08)",
      transition: "box-shadow 0.2s",
      minWidth: 180,
      fontWeight: 600,
    }}
  >
    <div>
      <div className="parentselectanswer-answer-label" style={{ color: "#18194a" }}>{userName}</div>
      <div
        className="parentselectanswer-answer-text"
        style={{ color: "#fff" }}
      >{inputQA}</div>
    </div>
  </div>
);

export default Card;