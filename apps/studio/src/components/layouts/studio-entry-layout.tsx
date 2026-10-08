import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/** Shared Studio chrome for flows that do not yet have a product workspace. */
export function StudioEntryLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-sidebar p-1">
      <header className="flex h-12 shrink-0 items-center px-4">
        <Link
          href="/onboarding"
          className="flex items-center gap-2.5 text-[15px] font-semibold"
        >
          <span className="grid size-8 place-items-center rounded-lg border bg-white shadow-sm">
            <Image src="/logo.png" alt="" width={24} height={24} preload />
          </span>
          Kortyx{" "}
          <span className="text-xs font-normal text-muted-foreground">
            Studio
          </span>
        </Link>
      </header>
      <main className="flex-1 rounded-2xl border bg-background px-6 py-8 sm:px-10">
        <div className="mx-auto w-full max-w-3xl space-y-6">{children}</div>
      </main>
    </div>
  );
}
