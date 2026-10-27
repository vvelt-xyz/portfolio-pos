"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { LABELS } from "@/constants";

const NAV = [
  { href: "/floor", label: LABELS.floor.title },
  { href: "/serve", label: LABELS.serve.title },
  { href: "/admin", label: LABELS.admin.title },
] as const;

export function AppShell({
  title,
  children,
  footer,
  footerTone = "default",
  headerRight,
  showNav = true,
  wide = false,
  flush = false,
}: {
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Visual separation for action panels (e.g. floor session menu). */
  footerTone?: "default" | "emphasis";
  headerRight?: ReactNode;
  showNav?: boolean;
  /** Wider shell for spreadsheet / IDE-like screens. */
  wide?: boolean;
  /** Main fills remaining height; children manage their own scroll. */
  flush?: boolean;
}) {
  const pathname = usePathname();

  return (
    <div
      className={[
        "mx-auto flex h-dvh w-full flex-col bg-zinc-50",
        wide
          ? "max-w-[100vw]"
          : "max-w-lg sm:max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl",
      ].join(" ")}
    >
      {title ? (
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200/80 bg-zinc-50 px-4 py-3">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
            {title}
          </h1>
          {headerRight ? (
            <div className="shrink-0">{headerRight}</div>
          ) : null}
        </header>
      ) : null}

      <main
        className={[
          "min-h-0 flex-1 overscroll-contain",
          flush
            ? "flex flex-col overflow-hidden"
            : "overflow-y-auto px-3 py-3 sm:px-4 sm:py-4",
        ].join(" ")}
      >
        {flush ? (
          children
        ) : (
          <div className="flex flex-col gap-4">{children}</div>
        )}
      </main>

      {footer ? (
        <div
          className={[
            "shrink-0 border-t px-3 py-3 sm:px-4",
            footerTone === "emphasis"
              ? "border-amber-200 bg-amber-50 shadow-[0_-6px_20px_rgba(24,24,27,0.06)]"
              : "border-zinc-200 bg-white",
          ].join(" ")}
        >
          {footer}
        </div>
      ) : null}

      {showNav ? (
        <nav className="shrink-0 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-3">
            {NAV.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "flex min-h-14 items-center justify-center px-2 text-center text-sm font-medium",
                    active ? "bg-zinc-900 text-white" : "text-zinc-600",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
