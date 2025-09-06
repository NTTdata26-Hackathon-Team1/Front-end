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
      borderRadius: 8,
      width: "100%",
      minWidth: 0,
      maxWidth: "20vw",
      padding: "0.4vw 0.7vw",
      boxShadow: selected ? "0 0 0 4px #f52ba7" : "0 2px 8px rgba(0,0,0,0.08)",
      transition: "box-shadow 0.2s",
      fontWeight: 600,
      fontSize: "1.2vw",
    }}
  >
    <div>
      <div className="parentselectanswer-answer-label" style={{ color: "#18194a", fontSize: "1.5vw" }}>{userName}</div>
      <div
        className="parentselectanswer-answer-text"
        style={{ color: "#fff", fontSize: "2vw" }}
      >{inputQA}</div>
    </div>
  </div>
);

export default Card;