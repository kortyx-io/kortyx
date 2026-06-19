import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RunsEmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
      <Search className="mb-3 size-7 text-muted-foreground" />
      <h2 className="font-medium">No runs match these filters</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Try changing your search or remove one of the active filters.
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onClear}>
        Clear filters
      </Button>
    </div>
  );
}
