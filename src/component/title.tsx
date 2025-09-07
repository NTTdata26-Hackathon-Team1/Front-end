import React from "react";

type TitleProps = {
  text?: string;
  style?: React.CSSProperties;
};

const Title: React.FC<TitleProps> = ({ text = "朝までそれ正解", style }) => (
  <h1
    className="standby-title"
    style={{
      fontFamily: "'Pixel', 'Arial', sans-serif",
      color: "#fff",
      fontSize: "6vw",
      textShadow: "0 0 1vw #ff69b4, 0.3vw 0.3vw 0 #ff69b4, -0.3vw -0.3vw 0 #ff69b4",
      textAlign: "center",
      marginBottom: "4vw",
      zIndex: 10,
      fontWeight: 900,
      ...(style || {}),
    }}
  >
    {text}
  </h1>
);

export default Title;