"use client";

import { useState } from "react";
import { LABELS } from "@/constants";
import { useAuth } from "@/store/auth-store";

export function SignOutButton({ className }: { className?: string }) {
  const { status, signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  if (status !== "signedIn" && status !== "missingStore") return null;

  async function onSignOut() {
    if (busy) return;
    setBusy(true);
    try {
      await signOut();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void onSignOut()}
      disabled={busy}
      className={
        className ??
        "inline-flex min-h-10 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium leading-none text-zinc-700 disabled:opacity-60"
      }
    >
      {LABELS.auth.signOut}
    </button>
  );
}
