"use client";

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import {
  cellKey,
  resolveAllFloorSeats,
  shapeVisualCenter,
  type FloorLayoutCatalog,
  type ResolvedFloorSeat,
} from "@/domain/floor-layout";

export type FloorSeatTone = {
  /** Outer button / card classes (bg + text). */
  className: string;
};

export function pointToFloorCell(
  board: HTMLElement,
  clientX: number,
  clientY: number,
  gridCols: number,
  gridRows: number,
): { col: number; row: number } {
  const rect = board.getBoundingClientRect();
  const x = Math.min(
    Math.max(clientX - rect.left, 0),
    Math.max(rect.width - 0.001, 0),
  );
  const y = Math.min(
    Math.max(clientY - rect.top, 0),
    Math.max(rect.height - 0.001, 0),
  );
  const col = Math.min(
    gridCols - 1,
    Math.max(0, Math.floor((x / rect.width) * gridCols)),
  );
  const row = Math.min(
    gridRows - 1,
    Math.max(0, Math.floor((y / rect.height) * gridRows)),
  );
  return { col, row };
}

type SeatDragHandlers = {
  /** Called while dragging; return true if the new anchor was accepted. */
  onDragAnchor: (
    seatId: string,
    anchorCol: number,
    anchorRow: number,
  ) => boolean;
  onSelect: (seatId: string) => void;
};

type FloorCanvasProps = {
  catalog: FloorLayoutCatalog;
  /**
   * editor: edit chrome (grid lines, drag).
   * ops: same full-grid geometry; card chrome only.
   * MUST: Ops never crops or rewrites empty cells — layout matches settings 1:1.
   * EN: Live floor uses the full configured grid including empty cells.
   */
  variant?: "editor" | "ops";
  /** Show faint empty cell grid (editor). */
  showGrid?: boolean;
  className?: string;
  renderSeat: (
    seat: ResolvedFloorSeat,
    opts: { dragging: boolean; dragInvalid: boolean },
  ) => ReactNode;
  onCellClick?: (col: number, row: number) => void;
  /** Highlight cells while painting / hover ghost. */
  highlightCells?: { col: number; row: number }[];
  highlightClassName?: string;
  /** Enable pointer-drag to move seats (snaps to grid via onDragAnchor). */
  seatDrag?: SeatDragHandlers;
  boardRef?: Ref<HTMLDivElement | null>;
};

type DragState = {
  seatId: string;
  pointerId: number;
  /** Pointer cell − seat anchor at grab time. */
  grabCol: number;
  grabRow: number;
  moved: boolean;
};

/**
 * Mobile-capped cell grid. Seats are absolute within the canvas using
 * bounding boxes; L-shapes paint only occupied cells.
 */
export function FloorCanvas({
  catalog,
  variant = "editor",
  showGrid = false,
  className = "",
  renderSeat,
  onCellClick,
  highlightCells,
  highlightClassName = "bg-amber-200/50",
  seatDrag,
  boardRef,
}: FloorCanvasProps) {
  const seats = resolveAllFloorSeats(catalog);
  const highlight = new Set((highlightCells ?? []).map(cellKey));
  const localBoardRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragUi, setDragUi] = useState<{
    seatId: string | null;
    invalid: boolean;
  }>({ seatId: null, invalid: false });

  /** Editor canvas: full configured grid including empty cells. */
  const view = {
    cols: catalog.gridCols,
    rows: catalog.gridRows,
  };

  const setBoardRef = useCallback(
    (el: HTMLDivElement | null) => {
      localBoardRef.current = el;
      if (typeof boardRef === "function") boardRef(el);
      else if (boardRef) boardRef.current = el;
    },
    [boardRef],
  );

  const endDrag = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      if (!drag.moved) {
        seatDrag?.onSelect(drag.seatId);
      }
      dragRef.current = null;
      setDragUi({ seatId: null, invalid: false });
    },
    [seatDrag],
  );

  const onSeatPointerDown = useCallback(
    (seat: ResolvedFloorSeat, e: ReactPointerEvent<HTMLDivElement>) => {
      if (!seatDrag || e.button !== 0) return;
      const board = localBoardRef.current;
      if (!board) return;
      e.preventDefault();
      e.stopPropagation();
      const cell = pointToFloorCell(
        board,
        e.clientX,
        e.clientY,
        catalog.gridCols,
        catalog.gridRows,
      );
      dragRef.current = {
        seatId: seat.id,
        pointerId: e.pointerId,
        grabCol: cell.col - seat.anchorCol,
        grabRow: cell.row - seat.anchorRow,
        moved: false,
      };
      setDragUi({ seatId: seat.id, invalid: false });
      e.currentTarget.setPointerCapture(e.pointerId);
      seatDrag.onSelect(seat.id);
    },
    [seatDrag, catalog.gridCols, catalog.gridRows],
  );

  const onSeatPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId || !seatDrag) return;
      const board = localBoardRef.current;
      if (!board) return;
      const cell = pointToFloorCell(
        board,
        e.clientX,
        e.clientY,
        catalog.gridCols,
        catalog.gridRows,
      );
      const anchorCol = cell.col - drag.grabCol;
      const anchorRow = cell.row - drag.grabRow;
      drag.moved = true;
      const ok = seatDrag.onDragAnchor(drag.seatId, anchorCol, anchorRow);
      setDragUi({ seatId: drag.seatId, invalid: !ok });
    },
    [seatDrag, catalog.gridCols, catalog.gridRows],
  );

  const draggingId = dragUi.seatId;
  const dragInvalid = dragUi.invalid;

  return (
    <div
      className={`mx-auto w-full ${className}`}
      style={{ maxWidth: "100%" }}
    >
      <div
        ref={setBoardRef}
        className="relative w-full touch-none overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-b from-zinc-100 to-zinc-50"
        style={{ aspectRatio: `${view.cols} / ${view.rows}` }}
      >
        {showGrid || onCellClick || highlight.size > 0 ? (
          <div
            className="absolute inset-0 grid"
            style={{
              gridTemplateColumns: `repeat(${catalog.gridCols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${catalog.gridRows}, minmax(0, 1fr))`,
            }}
          >
            {Array.from(
              { length: catalog.gridCols * catalog.gridRows },
              (_, i) => {
                const col = i % catalog.gridCols;
                const row = Math.floor(i / catalog.gridCols);
                const lit = highlight.has(cellKey({ col, row }));
                return (
                  <button
                    key={`${col}-${row}`}
                    type="button"
                    disabled={!onCellClick || Boolean(draggingId)}
                    aria-label={`cell ${col + 1},${row + 1}`}
                    className={[
                      "min-h-0 border border-zinc-200/40",
                      showGrid ? "bg-transparent" : "",
                      lit ? highlightClassName : "",
                      onCellClick && !draggingId
                        ? "cursor-pointer hover:bg-zinc-200/40"
                        : "pointer-events-none",
                    ].join(" ")}
                    onClick={() => onCellClick?.(col, row)}
                  />
                );
              },
            )}
          </div>
        ) : null}

        {seats.map((seat) => {
          const isDragging = draggingId === seat.id;
          return (
            <div
              key={seat.id}
              className={[
                "absolute z-[1]",
                seatDrag ? "cursor-grab active:cursor-grabbing" : "",
                isDragging ? "z-[2]" : "",
              ].join(" ")}
              style={{
                left: `${(seat.bounds.minCol / view.cols) * 100}%`,
                top: `${(seat.bounds.minRow / view.rows) * 100}%`,
                width: `${(seat.bounds.width / view.cols) * 100}%`,
                height: `${(seat.bounds.height / view.rows) * 100}%`,
              }}
              onPointerDown={
                seatDrag ? (e) => onSeatPointerDown(seat, e) : undefined
              }
              onPointerMove={seatDrag ? onSeatPointerMove : undefined}
              onPointerUp={seatDrag ? endDrag : undefined}
              onPointerCancel={seatDrag ? endDrag : undefined}
            >
              {renderSeat(seat, {
                dragging: isDragging,
                dragInvalid: isDragging && dragInvalid,
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type FloorSeatCardShellProps = {
  seat: ResolvedFloorSeat;
  toneClassName: string;
  selected?: boolean;
  blocked?: boolean;
  onClick?: () => void;
  children: ReactNode;
  /** Editor: show only filled polyomino cells. */
  showPolyominoFill?: boolean;
  dragging?: boolean;
  dragInvalid?: boolean;
};

/**
 * Card shell: polyomino fill + centered 3-line content slot.
 */
export function FloorSeatCardShell({
  seat,
  toneClassName,
  selected = false,
  blocked = false,
  onClick,
  children,
  showPolyominoFill = true,
  dragging = false,
  dragInvalid = false,
}: FloorSeatCardShellProps) {
  const occupied = new Set(
    seat.absoluteCells.map((c) =>
      cellKey({
        col: c.col - seat.bounds.minCol,
        row: c.row - seat.bounds.minRow,
      }),
    ),
  );
  const center = shapeVisualCenter(
    seat.absoluteCells.map((c) => ({
      col: c.col - seat.bounds.minCol,
      row: c.row - seat.bounds.minRow,
    })),
  );

  const interactive = Boolean(onClick) && !blocked;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={blocked}
        className={[
          "relative h-full w-full min-h-0 overflow-hidden rounded-xl p-0 text-center shadow-sm",
          !blocked ? "active:scale-[0.98] pointer-events-auto" : "",
          blocked ? "cursor-not-allowed opacity-40" : "",
          selected
            ? "z-10 outline outline-[3px] outline-offset-2 outline-amber-400 ring-4 ring-amber-300/60"
            : "",
          dragging ? "opacity-90 ring-2 ring-sky-300" : "",
          dragInvalid ? "opacity-50 ring-2 ring-rose-400" : "",
        ].join(" ")}
      >
        <SeatCardInner
          seat={seat}
          toneClassName={toneClassName}
          showPolyominoFill={showPolyominoFill}
          occupied={occupied}
          center={center}
        >
          {children}
        </SeatCardInner>
      </button>
    );
  }

  return (
    <div
      className={[
        "pointer-events-none relative h-full w-full min-h-0 overflow-hidden rounded-lg p-0 text-center shadow-sm",
        selected
          ? "z-10 outline outline-[3px] outline-offset-1 outline-amber-400 ring-2 ring-amber-300/60"
          : "",
        dragging ? "opacity-90 ring-2 ring-sky-300" : "",
        dragInvalid ? "opacity-50 ring-2 ring-rose-400" : "",
      ].join(" ")}
    >
      <SeatCardInner
        seat={seat}
        toneClassName={toneClassName}
        showPolyominoFill={showPolyominoFill}
        occupied={occupied}
        center={center}
      >
        {children}
      </SeatCardInner>
    </div>
  );
}

function SeatCardInner({
  seat,
  toneClassName,
  showPolyominoFill,
  occupied,
  center,
  children,
}: {
  seat: ResolvedFloorSeat;
  toneClassName: string;
  showPolyominoFill: boolean;
  occupied: Set<string>;
  center: { col: number; row: number };
  children: ReactNode;
}) {
  /** Ops: solid card — deploy-like flat fill, light shadow. */
  if (!showPolyominoFill) {
    return (
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center rounded-xl px-1.5 ${toneClassName}`}
      >
        {children}
      </div>
    );
  }

  return (
    <>
      <div
        className="absolute inset-0 grid gap-px p-px"
        style={{
          gridTemplateColumns: `repeat(${seat.bounds.width}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${seat.bounds.height}, minmax(0, 1fr))`,
        }}
      >
        {Array.from(
          { length: seat.bounds.width * seat.bounds.height },
          (_, i) => {
            const col = i % seat.bounds.width;
            const row = Math.floor(i / seat.bounds.width);
            const filled = occupied.has(cellKey({ col, row }));
            return (
              <span
                key={`${col}-${row}`}
                className={
                  filled ? `rounded-sm ${toneClassName}` : "bg-transparent"
                }
              />
            );
          },
        )}
      </div>

      <div
        className="pointer-events-none absolute z-[1] flex max-w-[95%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center px-0.5"
        style={{
          left: `${(center.col / seat.bounds.width) * 100}%`,
          top: `${(center.row / seat.bounds.height) * 100}%`,
        }}
      >
        {children}
      </div>
    </>
  );
}
