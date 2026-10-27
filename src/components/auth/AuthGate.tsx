"use client";

import type { ReactNode } from "react";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { LABELS } from "@/constants";
import { useAuth } from "@/store/auth-store";

export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-50 text-sm text-zinc-600">
        {LABELS.common.loading}
      </div>
    );
  }

  if (status === "signedOut") {
    return <LoginScreen />;
  }

  if (status === "missingStore") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-zinc-50 px-4 text-center text-zinc-900">
        <h1 className="text-xl font-semibold">
          {LABELS.auth.missingStoreTitle}
        </h1>
        <p className="max-w-sm text-sm leading-relaxed text-zinc-600">
          {LABELS.auth.missingStoreBody}
        </p>
        <SignOutButton />
      </div>
    );
  }

  if (status === "misconfigured") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-zinc-50 px-4 text-center text-zinc-900">
        <h1 className="text-xl font-semibold">
          {LABELS.auth.misconfiguredTitle}
        </h1>
        <p className="max-w-sm text-sm leading-relaxed text-zinc-600">
          {LABELS.auth.misconfiguredBody}
        </p>
      </div>
    );
  }

  return children;
}
