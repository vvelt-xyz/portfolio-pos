import Link from "next/link";
import { LABELS } from "@/constants";

export function HomeLink() {
  return (
    <Link
      href="/"
      className="inline-flex min-h-10 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium leading-none text-zinc-700"
    >
      {LABELS.common.home}
    </Link>
  );
}
