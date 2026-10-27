"use client";

import type { ReactNode } from "react";
import {
  resolveAllFloorSeats,
  type FloorLayoutCatalog,
  type ResolvedFloorSeat,
} from "@/domain/floor-layout";

type FloorOpsBoardProps = {
  catalog: FloorLayoutCatalog;
  className?: string;
  /**
   * When true (default), board height grows with viewport for live floor.
   * Settings preview should pass false so height stays the configured rem.
   * EN: Live floor fluid height; editor preview uses fixed rem.
   */
  responsiveHeight?: boolean;
  renderSeat: (seat: ResolvedFloorSeat) => ReactNode;
};

/**
 * Live floor — CSS Grid stage (deploy chrome, optional fluid size).
 *
 * Deploy look: panel + gap-2 grid + solid cards.
 * Responsive (live): `w-full` of the shell; height `clamp`s with viewport
 * so PC is larger and phone stays near `opsBoardHeightRem`.
 *
 * MUST: Empty cells remain empty tracks — do not crop.
 * EN: Preserve full configured grid including whitespace.
 */
export function FloorOpsBoard({
  catalog,
  className = "",
  responsiveHeight = true,
  renderSeat,
}: FloorOpsBoardProps) {
  const seats = resolveAllFloorSeats(catalog);
  const baseRem = catalog.opsBoardHeightRem ?? 15.5;
  /** Phone ≈ base; md/lg/xl grow toward ~1.75× via viewport clamp. */
  const height = responsiveHeight
    ? `clamp(${baseRem}rem, 48vw, ${(baseRem * 1.75).toFixed(2)}rem)`
    : `${baseRem}rem`;

  return (
    <div
      className={`w-full rounded-2xl border border-zinc-200 bg-gradient-to-b from-zinc-100 to-zinc-50 p-3 sm:p-4 md:p-5 ${className}`}
    >
      <div
        className="grid w-full gap-2 sm:gap-2.5 md:gap-3"
        style={{
          gridTemplateColumns: `repeat(${catalog.gridCols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${catalog.gridRows}, minmax(0, 1fr))`,
          height,
        }}
      >
        {seats.map((seat) => (
          <div
            key={seat.id}
            className="min-h-0 min-w-0"
            style={{
              gridColumn: `${seat.bounds.minCol + 1} / span ${seat.bounds.width}`,
              gridRow: `${seat.bounds.minRow + 1} / span ${seat.bounds.height}`,
            }}
          >
            {renderSeat(seat)}
          </div>
        ))}
      </div>
    </div>
  );
}
