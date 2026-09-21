"use client";

import { InputHTMLAttributes, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { fieldClass } from "./TextField";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  error?: string;
};

export function PasswordField({
  label,
  error,
  id,
  className = "",
  ...props
}: Props) {
  const [visible, setVisible] = useState(false);
  const inputId = id ?? props.name ?? "password";

  return (
    <label className="block space-y-1.5" htmlFor={inputId}>
      <span className="text-sm font-medium text-ink">{label}</span>
      <span className="relative block">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          autoComplete={props.autoComplete ?? "current-password"}
          className={`${fieldClass} pr-12 ${error ? "border-coral" : "border-line"} ${className}`}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted hover:text-ink"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
      {error ? <span className="text-sm text-coral">{error}</span> : null}
    </label>
  );
}
