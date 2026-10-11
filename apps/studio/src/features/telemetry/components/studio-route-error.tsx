"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { studioFeature, studioOperation, usageSurface } from "@/usage/client";

export function StudioRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const reported = useRef<Error | undefined>(undefined);
  useEffect(() => {
    if (reported.current === error) return;
    reported.current = error;
    studioOperation("studio.render", { resource: usageSurface(pathname) }).fail(
      error,
    );
  }, [error, pathname]);
  return (
    <div className="flex h-full items-center justify-center rounded-xl border bg-background p-6">
      <div className="max-w-md text-center">
        <h1 className="text-base font-semibold">Unable to load this view</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error.message || "An unexpected server error occurred."}
        </p>
        <Button
          className="mt-4"
          variant="outline"
          onClick={() => {
            studioFeature("studio.render", {
              resource: usageSurface(pathname),
              action: "retry",
            });
            reset();
          }}
        >
          Try again
        </Button>
      </div>
    </div>
  );
}
