"use client";

import { Button } from "@/components/ui/button";

export function StudioRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center rounded-xl border bg-background p-6">
      <div className="max-w-md text-center">
        <h1 className="text-base font-semibold">Unable to load this view</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error.message || "An unexpected server error occurred."}
        </p>
        <Button className="mt-4" variant="outline" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
