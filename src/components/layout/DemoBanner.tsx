import { APP } from "@/constants";

/** Persistent demo disclaimer — portfolio showcase only. */
export function DemoBanner() {
  return (
    <div
      role="status"
      className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs leading-relaxed text-amber-950"
    >
      {APP.demoBanner}
    </div>
  );
}
