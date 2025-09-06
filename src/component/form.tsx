import React from "react";

type FormProps = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  disabled?: boolean;
  maxLength?: number;
  placeholder?: string;
  children?: React.ReactNode;
};

const Form: React.FC<FormProps> = ({
  value,
  onChange,
  onSubmit,
  disabled = false,
  maxLength = 12,
  placeholder = "解答を入力してください",
  children,
}) => (
  <form className="childanswer-form" onSubmit={onSubmit}>
    <input
      className="childanswer-input"
      type="text"
      placeholder={placeholder}
      value={value}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
      disabled={disabled}
    />
    {children}
  </form>
);

export default Form;