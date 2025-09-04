import React, { useState } from "react";
import { useDanmaku } from "./DanmakuProvider";

const DanmakuInput: React.FC<{ fixedBottom?: boolean; placeholder?: string }> = ({
  fixedBottom = false,
  placeholder = "コメントを入力して Enter",
}) => {
  const { send } = useDanmaku();
  const [val, setVal] = useState("");

  const onSend = () => {
    const t = val.trim();
    if (!t) return;
    send(t);
    setVal("");
  };

  return (
    <div
      style={{
        position: fixedBottom ? "fixed" : "relative",
        left: fixedBottom ? 0 : undefined,
        right: fixedBottom ? 0 : undefined,
        bottom: fixedBottom ? 0 : undefined,
        zIndex: 10000,
        background: fixedBottom ? "rgba(0,0,0,0.75)" : "transparent",
        backdropFilter: fixedBottom ? "blur(6px)" : undefined,
        padding: fixedBottom ? "10px 12px" : 0,
        display: "flex",
        gap: 8,
        alignItems: "center",
        pointerEvents: "auto",
      }}
    >
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder={placeholder}
        style={{
          flex: 1,
          height: 40,
          fontSize: 16,
          padding: "0 12px",
          borderRadius: 12,
          border: "1px solid #333",
          background: "#1b1b1b",
          color: "#fff",
          outline: "none",
        }}
      />
      <button
        onClick={onSend}
        style={{
          height: 40,
          padding: "0 16px",
          borderRadius: 12,
          border: "none",
          background: "#4cc9f0",
          color: "#111",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        送信
      </button>
    </div>
  );
};

export default DanmakuInput;
