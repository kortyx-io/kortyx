import { RefreshCw, Search } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LiveRefreshButton } from "@/features/telemetry/components/live-refresh-button";
import type { LiveRefreshStatus } from "@/features/telemetry/lib/live-refresh-controller";
import { cn } from "@/lib/utils";

type ListToolbarProps = {
  controls?: ReactNode;
  title: string;
  subtitle: string;
  search: string;
  searchPlaceholder: string;
  refreshing: boolean;
  live?: boolean;
  liveStatus?: LiveRefreshStatus;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onToggleLive?: () => void;
};

/** Shared header treatment for the operational table routes. */
export function ListToolbar({
  controls,
  title,
  subtitle,
  search,
  searchPlaceholder,
  refreshing,
  live,
  liveStatus = live ? "connecting" : "off",
  onSearchChange,
  onRefresh,
  onToggleLive,
}: ListToolbarProps) {
  return (
    <div className="z-20 shrink-0 border-b bg-background/95 px-5 pt-4 backdrop-blur supports-backdrop-filter:bg-background/75">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {onToggleLive && (
            <LiveRefreshButton
              enabled={Boolean(live)}
              status={liveStatus}
              onToggle={onToggleLive}
            />
          )}
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={`Refresh ${title.toLowerCase()}`}
            onClick={onRefresh}
          >
            <RefreshCw className={cn(refreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pb-3">
        <div className="relative min-w-0 basis-full flex-1 sm:basis-48">
          <Search className="pointer-events-none absolute top-2 left-3 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 pl-9"
          />
        </div>
        {controls}
      </div>
    </div>
  );
}
