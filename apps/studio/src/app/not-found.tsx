import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
          404
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Page not found
        </h1>
        <p className="text-muted-foreground text-sm">
          The page you're looking for doesn't exist or has been moved.
        </p>
      </div>
      <Button asChild size="sm">
        <Link href="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}
