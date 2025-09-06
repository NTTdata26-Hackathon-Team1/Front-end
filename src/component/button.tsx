import React from "react";

type ButtonProps = {
  type?: "button" | "submit";
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
};

const Button: React.FC<ButtonProps> = ({
  type = "button",
  disabled = false,
  children,
  onClick,
  className = "childanswer-btn",
}) => (
  <button
    type={type}
    disabled={disabled}
    onClick={onClick}
    className={className}
  >
    {children}
  </button>
);

export default Button;