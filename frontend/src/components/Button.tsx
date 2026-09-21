import { ButtonHTMLAttributes } from "react";
import { Spinner } from "./Spinner";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
};

export function Button({
  children,
  loading = false,
  disabled,
  className = "",
  type = "button",
  ...props
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl gradient-brand px-5 text-[15px] font-semibold text-white transition hover:shadow-glow hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}
