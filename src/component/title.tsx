import React from "react";

type TitleProps = {
  text?: string;
};

const Title: React.FC<TitleProps> = ({ text = "朝までそれ正解" }) => (
  <h1
    className="standby-title"
    style={{
      textShadow: "0 4px 24px #f52ba7ff, 0 1px 0 #f645bbff",
      fontWeight: 900,
      color: "#fcfbfbff",
    }}
  >
    {text}
  </h1>
);

export default Title;