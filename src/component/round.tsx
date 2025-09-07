import React from "react";

type RoundProps = {
  round?: number | null;
  loading?: boolean;
};

const Round: React.FC<RoundProps> = ({ round, loading }) => (
  <div
    className="childanswer-round"
    style={{
      fontFamily: "'Pixel', 'Arial', sans-serif",
      color: "#fff",
      fontSize: "2vw",
      textShadow: "0 0 1vw #ff69b4, 0.3vw 0.3vw 0 #ff69b4, -0.3vw -0.3vw 0 #ff69b4",
      textAlign: "left",
      fontWeight: 900,
      marginTop: "1vw",
      marginLeft: "2vw",
      zIndex: 10,
      whiteSpace: "nowrap",
    }}
  >
    ROUND {loading ? "…" : round ?? "—"}
  </div>
);

export default Round;