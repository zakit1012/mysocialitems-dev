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
    <div className="flex min-h-screen items-center justify-center px-4 py-10 gradient-subtle">
      <div className="w-full max-w-[420px]">
        <Link href="/" className="mb-8 block text-center text-2xl font-black gradient-brand-text">
          My Social Items
        </Link>
        <div className="rounded-3xl bg-white p-7 shadow-panel">
          <h1 className="text-2xl font-black tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm leading-6 text-muted">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-5 text-center text-sm text-muted">{footer}</p>
      </div>
    </div>
  );
}
