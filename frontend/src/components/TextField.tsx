import { InputHTMLAttributes } from "react";

const fieldClass =
  "w-full rounded-xl border bg-white px-4 py-3 text-[15px] text-ink outline-none transition placeholder:text-hint focus:border-brand focus:ring-4 focus:ring-brand/12 disabled:bg-sand";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export function TextField({ label, error, id, className = "", ...props }: Props) {
  const inputId = id ?? props.name ?? label.toLowerCase().replace(/\s+/g, "-");

  return (
    <label className="block space-y-1.5" htmlFor={inputId}>
      <span className="text-sm font-medium text-ink">{label}</span>
      <input
        id={inputId}
        className={`${fieldClass} ${error ? "border-coral" : "border-line"} ${className}`}
        {...props}
      />
      {error ? <span className="text-sm text-coral">{error}</span> : null}
    </label>
  );
}

export { fieldClass };
