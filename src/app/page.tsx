import Link from "next/link";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { APP, LABELS } from "@/constants";

export default function Home() {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center overflow-y-auto bg-zinc-50 px-4 text-zinc-900">
      <main className="flex w-full max-w-lg flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm tracking-wide text-zinc-500">{APP.name}</p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {LABELS.home.title}
            </h1>
          </div>
          <SignOutButton />
        </div>
        <p className="text-base leading-relaxed text-zinc-600">
          {LABELS.home.subtitle}
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href="/floor"
            className="flex min-h-12 items-center justify-center rounded-xl bg-zinc-900 text-sm font-medium text-white"
          >
            {LABELS.home.openFloor}
          </Link>
          <Link
            href="/backoffice"
            className="flex min-h-12 items-center justify-center rounded-xl border border-zinc-300 text-sm font-medium"
          >
            {LABELS.home.openBackoffice}
          </Link>
        </div>
      </main>
    </div>
  );
}
