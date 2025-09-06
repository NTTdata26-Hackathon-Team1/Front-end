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
  >
    <div>
      <div className="parentselectanswer-answer-label">{userName}</div>
      <div className="parentselectanswer-answer-text">{inputQA}</div>
    </div>
  </div>
);

export default Card;