import Link from "next/link";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    // Sized to fit one screen, a laptop or a phone, without scrolling.
    <div className="flex min-h-dvh items-center justify-center px-4 py-5 gradient-subtle">
      <div className="w-full max-w-[440px]">
        <Link href="/" className="mb-4 block text-center text-xl font-black gradient-brand-text">
          My Social Items
        </Link>
        <div className="rounded-3xl bg-white p-6 shadow-panel">
          <h1 className="text-xl font-black tracking-tight">{title}</h1>
          <p className="mt-1 text-[13px] leading-5 text-muted">{subtitle}</p>
          <div className="mt-4">{children}</div>
        </div>
        <p className="mt-4 text-center text-sm text-muted">{footer}</p>
      </div>
    </div>
  );
}
