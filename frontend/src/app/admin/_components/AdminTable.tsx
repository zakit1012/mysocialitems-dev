import { Search } from "lucide-react";

/** The admin lists share one look: a card, a sticky header row, calm rows. */
export function AdminTable({ head, children, empty }: { head: string[]; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-card shadow-card">
      <table className="w-full min-w-[720px] text-[13px]">
        <thead>
          <tr className="border-b border-line bg-sand/60 text-left text-[11px] uppercase tracking-wide text-muted">
            {head.map((h, i) => (
              <th key={i} className="px-4 py-3 font-bold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {empty ? (
            <tr>
              <td colSpan={head.length} className="px-4 py-10 text-center text-muted">
                Nothing here yet.
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative mb-4 block max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-hint" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-xl border border-line bg-card py-2.5 pl-9 pr-3 text-[13px] outline-none focus:border-brand"
      />
    </label>
  );
}

/** Wraps a whole tab component that brings its own padding in a card. */
export function AdminCard({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">{children}</div>;
}
