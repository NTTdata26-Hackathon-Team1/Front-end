import React from "react";

type RoundProps = {
  round?: number | null;
  loading?: boolean;
};

const Round: React.FC<RoundProps> = ({ round, loading }) => (
  <div
    className="childanswer-round"
    style={{
      textShadow: "0 4px 24px #f52ba7ff, 0 1px 0 #f645bbff",
      fontWeight: 900,
      color: "#fcfbfbff",
    }}
  >
    ROUND {loading ? "…" : round ?? "—"}
  </div>
);

export default Round;