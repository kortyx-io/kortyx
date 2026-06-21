import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type ListFilterPanelProps = {
  ariaLabel: string;
  activeFilterCount: number;
  hasActiveFilters: boolean;
  open: boolean;
  onClose: () => void;
  onClear: () => void;
  children: ReactNode;
};

export function ListFilterPanel({
  ariaLabel,
  activeFilterCount,
  hasActiveFilters,
  open,
  onClose,
  onClear,
  children,
}: ListFilterPanelProps) {
  return (
    <aside
      aria-label={ariaLabel}
      aria-hidden={!open}
      inert={!open}
      className="relative flex h-full min-h-0 w-72 self-stretch flex-col overflow-clip rounded-xl border bg-background shadow-sm transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Filters</h2>
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-foreground px-1.5 text-[10px] leading-4 text-background">
              {activeFilterCount}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close filters"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <ScrollArea type="hover" className="h-0 min-h-0 flex-1">
        <div className="p-4 pb-18">{children}</div>
      </ScrollArea>
      <div className="absolute right-0 bottom-0 left-0 flex h-14 items-center border-t bg-background p-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          disabled={!hasActiveFilters}
          onClick={onClear}
        >
          <X /> Clear filters
        </Button>
      </div>
    </aside>
  );
}

export function FilterSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b py-4 first:pt-0 last:border-b-0">
      <h3 className="mb-2 px-2 text-xs font-medium text-muted-foreground">
        {title}
      </h3>
      <div>{children}</div>
    </section>
  );
}

export function FilterCheckbox({
  label,
  checked,
  onChange,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
      <span className="relative flex size-4 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className={cn(
            "size-4 cursor-pointer appearance-none rounded-sm border border-input bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring",
            checked && "border-primary bg-primary",
          )}
        />
        {checked && (
          <Check className="pointer-events-none absolute size-3 text-background" />
        )}
      </span>
      {label}
    </label>
  );
}

export function FilterText({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  id: string;
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder: string;
  type?: "text" | "number";
}) {
  return (
    <label
      htmlFor={id}
      className="mt-3 block first:mt-0 text-xs font-medium text-muted-foreground"
    >
      {label}
      <Input
        id={id}
        type={type}
        min={type === "number" ? "0" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1.5"
      />
    </label>
  );
}
