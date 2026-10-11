"use client";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function EvalDropdown({
  label,
  value,
  options,
  onChange,
  disabled,
  className,
  triggerLabel,
  search,
}: {
  label: string;
  value: string;
  options: {
    value: string;
    label: string;
    disabled?: boolean;
    description?: string;
  }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  triggerLabel?: string;
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    label: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchable = Boolean(search);
  useEffect(() => {
    if (!open || !searchable) return;
    const frame = requestAnimationFrame(() => searchInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, searchable]);
  const selected = options.find((item) => item.value === value);
  const displayLabel =
    triggerLabel ?? selected?.label ?? `Choose ${label.toLowerCase()}`;
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) search?.onChange("");
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label={label}
          title={displayLabel}
          className={cn("h-8 max-w-full justify-between text-xs", className)}
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 opacity-50"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        onEscapeKeyDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        className="max-h-80 w-(--radix-dropdown-menu-trigger-width) min-w-0 max-w-[calc(100vw-2rem)] overflow-y-auto"
      >
        {search && (
          <div className="p-1">
            <Input
              ref={searchInput}
              aria-label={search.label}
              placeholder={search.placeholder}
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  event.currentTarget
                    .closest('[role="menu"]')
                    ?.querySelector<HTMLElement>(
                      '[role="menuitemradio"]:not([data-disabled])',
                    )
                    ?.focus();
                }
              }}
            />
          </div>
        )}
        {search && !options.length && (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            No matching prompts for this application.
          </p>
        )}
        <DropdownMenuRadioGroup
          aria-label={label}
          value={value}
          onValueChange={onChange}
        >
          {options.map((item) => (
            <DropdownMenuRadioItem
              key={item.value}
              value={item.value}
              disabled={item.disabled}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate" title={item.label}>
                  {item.label}
                </span>
                {item.description ? (
                  <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
                    {item.description}
                  </span>
                ) : null}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
