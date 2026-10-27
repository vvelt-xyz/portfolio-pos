import { Suspense } from "react";
import { FloorBoard } from "@/components/floor/FloorBoard";
import { LABELS } from "@/constants";

export default function FloorPage() {
  return (
    <Suspense
      fallback={
        <p className="p-4 text-sm text-zinc-500">{LABELS.common.loading}</p>
      }
    >
      <FloorBoard />
    </Suspense>
  );
}
