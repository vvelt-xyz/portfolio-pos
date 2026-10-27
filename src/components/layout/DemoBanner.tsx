import { APP } from "@/constants";

/** Persistent demo disclaimer — portfolio showcase only. Shrink-0; does not scroll the shell. */
export function DemoBanner() {
  return (
    <div
      role="status"
      className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-center text-[11px] leading-snug text-amber-950 sm:text-xs sm:leading-relaxed"
    >
      {APP.demoBanner}
      <span className="mx-1.5 text-amber-700/70">·</span>
      <span className="text-amber-900/80">{APP.copyright}</span>
    </div>
  );
}
