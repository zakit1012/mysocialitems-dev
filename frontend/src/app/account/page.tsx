"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function AccountPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login?next=/account");
    }
  }, [loading, user, router]);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-xl px-4 py-16 animate-fade-in-up">
      <h1 className="text-3xl font-black">Account</h1>
      <div className="mt-8 space-y-3 rounded-4xl border border-line/60 bg-card shadow-panel p-6">
        <p>
          <span className="text-muted">Name</span>
          <br />
          {user.name}
        </p>
        <p>
          <span className="text-muted">Email</span>
          <br />
          {user.email}
        </p>
        <p>
          <span className="text-muted">Role</span>
          <br />
          {user.role}
        </p>
        <p>
          <span className="text-muted">City</span>
          <br />
          {user.city || "—"}
        </p>
        <button
          onClick={() => {
            logout();
            router.push("/");
          }}
          className="mt-4 rounded-full gradient-brand px-5 py-2 text-white transition hover:bg-brand-dark hover:shadow-glow"
        >
          Log out
        </button>
      </div>
    </div>
  );
}
