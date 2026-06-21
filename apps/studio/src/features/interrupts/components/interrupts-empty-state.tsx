import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export function InterruptsEmptyState({
  hasFilters,
  onClear,
}: {
  hasFilters: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
      <Search className="mb-3 size-7 text-muted-foreground" />
      <h2 className="font-medium">
        {hasFilters ? "No interrupts match these filters" : "No telemetry yet"}
      </h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {hasFilters
          ? "Try changing your search or remove one of the active filters."
          : "Interrupt requests will appear here when a workflow needs human input."}
      </p>
      {hasFilters && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </div>
  );
}
