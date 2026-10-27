"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LABELS } from "@/constants";

const SIZE_CLASS = {
  md: "max-h-[min(80dvh,36rem)] max-w-md",
  lg: "h-[min(90dvh,52rem)] max-h-[min(90dvh,52rem)] max-w-3xl",
  /** Near full-viewport (order / heavy staff UIs). */
  full: "h-[min(98dvh,100%)] max-h-[98dvh] w-full max-w-none",
} as const;

export function OverlayDialog({
  children,
  onClose,
  size = "md",
  tone = "amber",
  footer,
  /** Children manage scroll (e.g. sticky cart). Body does not scroll. */
  fillHeight = false,
}: {
  children: ReactNode;
  onClose: () => void;
  size?: keyof typeof SIZE_CLASS;
  tone?: "amber" | "white";
  footer?: ReactNode;
  fillHeight?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const panelTone =
    tone === "amber"
      ? "border-amber-200 bg-amber-50"
      : "border-zinc-200 bg-zinc-50";
  const closeHover =
    tone === "amber"
      ? "hover:bg-amber-100/80 hover:text-zinc-800"
      : "hover:bg-zinc-200/80 hover:text-zinc-900";

  const isFull = size === "full";

  // MUST: Outer shell is pointer-events-none so tall dialogs never let the
  //       backdrop steal clicks on the footer; only backdrop + panel receive events.
  // EN: Prevent backdrop from intercepting footer clicks on tall overlays.
  const dialog = (
    <div
      className={[
        "pointer-events-none fixed inset-0 z-50 flex items-center justify-center",
        isFull ? "p-0 sm:p-1" : "p-3 sm:p-4",
      ].join(" ")}
    >
      <button
        type="button"
        aria-label={LABELS.floor.closePanel}
        className="pointer-events-auto absolute inset-0 bg-zinc-900/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={[
          "pointer-events-auto relative z-10 flex w-full flex-col overflow-hidden border shadow-xl",
          isFull ? "rounded-none sm:rounded-xl" : "rounded-2xl",
          SIZE_CLASS[size],
          panelTone,
        ].join(" ")}
      >
        <button
          type="button"
          aria-label={LABELS.floor.closePanel}
          className={[
            "absolute top-1.5 right-1.5 z-20 flex h-11 w-11 items-center justify-center rounded-full text-2xl leading-none text-zinc-500 shadow-sm sm:top-2 sm:right-2",
            isFull
              ? "bg-white/90 backdrop-blur-sm"
              : "",
            closeHover,
          ].join(" ")}
          onClick={onClose}
        >
          ×
        </button>
        <div
          className={[
            "min-h-0 flex-1",
            // full: no pr-12 gutter — close floats over content; menu uses full width
            isFull
              ? "px-1.5 py-2 sm:px-3 sm:py-3"
              : "px-3 py-3 pr-12 sm:px-4",
            fillHeight ? "flex flex-col overflow-hidden" : "overflow-y-auto",
          ].join(" ")}
        >
          {children}
        </div>
        {footer ? (
          <div
            className={[
              "relative z-10 shrink-0 border-t bg-inherit px-3 py-3 sm:px-4",
              tone === "amber" ? "border-amber-200/80" : "border-zinc-200",
            ].join(" ")}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(dialog, document.body);
}
