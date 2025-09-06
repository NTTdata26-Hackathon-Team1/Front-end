import React from "react";

type TitleProps = {
  text?: string;
};

const Title: React.FC<TitleProps> = ({ text = "朝までそれ正解" }) => (
  <h1
    className="standby-title"
    style={{
      fontFamily: "'Pixel', 'Arial', sans-serif",
      color: "#fff",
      fontSize: "6vw",
      textShadow: "0 0 1vw #ff69b4, 0.3vw 0.3vw 0 #ff69b4, -0.3vw -0.3vw 0 #ff69b4",
      textAlign: "center",
      marginTop: "0vw",
      marginBottom: "4vw",
      zIndex: 10,
      fontWeight: 900,
    }}
  >
    {text}
  </h1>
);

export default Title;