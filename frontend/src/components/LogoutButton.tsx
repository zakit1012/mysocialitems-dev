"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ConfirmDialog } from "./ConfirmDialog";

/** Any "Log out" control: asks first, then signs out and leaves. */
export function LogoutButton({
  className,
  children,
  redirectTo = "/login",
}: {
  className?: string;
  children: React.ReactNode;
  redirectTo?: string;
}) {
  const { logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" title="Log out" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <ConfirmDialog
        open={open}
        title="Log out?"
        message="You will need to sign in again to manage your widgets."
        confirmLabel="Log out"
        danger
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          logout();
          router.push(redirectTo);
        }}
      />
    </>
  );
}
