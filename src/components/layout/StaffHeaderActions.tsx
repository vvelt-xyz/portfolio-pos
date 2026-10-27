"use client";

import { useState } from "react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { HomeLink } from "@/components/layout/HomeLink";
import { LABELS } from "@/constants";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { usePos } from "@/store/pos-store";

/** Header: refresh + logout + home for floor / serve / admin. */
export function StaffHeaderActions() {
  const { refreshFromCloud } = usePos();
  const [busy, setBusy] = useState(false);
  const showRefresh = isFirebaseConfigured();

  async function onRefresh() {
    if (busy) return;
    setBusy(true);
    try {
      await refreshFromCloud();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      {showRefresh ? (
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={busy}
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium leading-none text-zinc-700 disabled:opacity-60"
        >
          {busy ? LABELS.common.refreshing : LABELS.common.refresh}
        </button>
      ) : null}
      <SignOutButton />
      <HomeLink />
    </div>
  );
}
