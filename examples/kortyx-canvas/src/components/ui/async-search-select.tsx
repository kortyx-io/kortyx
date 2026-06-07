"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type AsyncSearchSelectProps<T> = {
  onSearch: (query: string) => Promise<T[]>;
  value: T | null;
  onChange: (value: T | null) => void;
  renderItem: (item: T) => React.ReactNode;
  getItemValue: (item: T) => string;
  getItemLabel: (item: T) => string;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  showClear?: boolean;
};

export function AsyncSearchSelect<T>({
  onSearch,
  value,
  onChange,
  renderItem,
  getItemValue,
  getItemLabel,
  placeholder,
  searchPlaceholder,
  emptyMessage,
}: AsyncSearchSelectProps<T>) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<T[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = window.setTimeout(async () => {
      const result = await onSearch(query);
      if (!cancelled) setItems(result);
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [onSearch, query]);

  const display = useMemo(
    () => (value ? getItemLabel(value) : ""),
    [getItemLabel, value],
  );

  return (
    <div className={cn("relative isolate", isOpen && "z-100")}>
      <button
        type="button"
        onClick={() => setIsOpen((next) => !next)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-card px-3 py-2 text-left text-sm"
      >
        <span className={value ? "truncate" : "truncate text-muted-foreground"}>
          {display || placeholder}
        </span>
      </button>
      {isOpen ? (
        <div className="absolute left-0 right-0 z-100 mt-1 rounded-md border border-border bg-background p-2 text-foreground shadow-xl">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              className="bg-card pl-8 dark:bg-card"
            />
          </div>
          <div className="mt-2 max-h-64 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-2 py-3 text-center text-muted-foreground text-sm">
                {emptyMessage}
              </p>
            ) : (
              items.map((item) => (
                <button
                  key={getItemValue(item)}
                  type="button"
                  onClick={() => {
                    onChange(item);
                    setIsOpen(false);
                  }}
                  className="w-full cursor-pointer rounded-sm px-2 py-2 text-left transition hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                >
                  {renderItem(item)}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
