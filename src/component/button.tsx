import React from "react";

type ButtonProps = {
  type?: "button" | "submit";
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  size?: "small" | "medium" | "large";
  sx?: React.CSSProperties;
};

const Button: React.FC<ButtonProps> = ({
  type = "button",
  disabled = false,
  children,
  onClick,
  className = "childanswer-btn",
  size = "medium",
  sx = {},
}) => {
  // Size-based style
  let sizeStyle: React.CSSProperties = {};
  if (size === "small") {
    sizeStyle = { fontSize: "0.85rem", padding: "4px 12px", minWidth: 48 };
  } else if (size === "large") {
    sizeStyle = { fontSize: "1.15rem", padding: "10px 24px", minWidth: 120 };
  }
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={className}
      style={{ ...sizeStyle, ...sx }}
    >
      {children}
    </button>
  );
};

export default Button;