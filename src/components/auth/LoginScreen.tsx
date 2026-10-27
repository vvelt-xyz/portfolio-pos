"use client";

import { useState, type FormEvent } from "react";
import { APP, LABELS } from "@/constants";
import { AUTH_LOGIN_ID } from "@/lib/firebase/client";
import { useAuth } from "@/store/auth-store";

const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD?.trim() ?? "";

export function LoginScreen() {
  const { signIn } = useAuth();
  const [loginId, setLoginId] = useState(AUTH_LOGIN_ID);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSignIn(id: string, pass: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(id, pass);
    } catch {
      setError(LABELS.auth.invalidCredentials);
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await runSignIn(loginId, password);
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-4 text-zinc-900">
      <main className="flex w-full max-w-sm flex-col gap-5">
        <div className="flex flex-col items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/welt-logo.png"
            alt="WELT"
            className="h-8 w-auto object-contain"
          />
          <div className="flex flex-col gap-1">
            <p className="text-sm tracking-wide text-zinc-500">{APP.name}</p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {LABELS.auth.title}
            </h1>
            <p className="text-sm leading-relaxed text-zinc-600">
              {LABELS.auth.subtitle}
            </p>
          </div>
        </div>
        {DEMO_PASSWORD ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void runSignIn(AUTH_LOGIN_ID, DEMO_PASSWORD)}
            className="flex min-h-12 items-center justify-center rounded-xl bg-zinc-900 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? LABELS.auth.signingIn : LABELS.auth.oneClick}
          </button>
        ) : null}
        <form className="flex flex-col gap-3" onSubmit={(e) => void onSubmit(e)}>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700">{LABELS.auth.loginId}</span>
            <input
              type="text"
              name="loginId"
              autoComplete="username"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              className="min-h-11 rounded-xl border border-zinc-300 bg-white px-3 text-base outline-none focus:border-zinc-500"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700">{LABELS.auth.password}</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-11 rounded-xl border border-zinc-300 bg-white px-3 text-base outline-none focus:border-zinc-500"
              required
            />
          </label>
          <p className="text-xs text-zinc-500">{LABELS.auth.demoHint}</p>
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="mt-1 flex min-h-12 items-center justify-center rounded-xl border border-zinc-300 text-sm font-medium disabled:opacity-60"
          >
            {busy ? LABELS.auth.signingIn : LABELS.auth.signIn}
          </button>
        </form>
      </main>
    </div>
  );
}
