"use client";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function EvalDropdown({
  label,
  value,
  options,
  onChange,
  disabled,
  className,
  triggerLabel,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  triggerLabel?: string;
}) {
  const selected = options.find((item) => item.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label={label}
          className={cn("h-8 max-w-full justify-between text-xs", className)}
        >
          <span className="truncate">
            {triggerLabel ?? selected?.label ?? `Choose ${label.toLowerCase()}`}
          </span>
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
        className="max-h-80 max-w-[min(32rem,calc(100vw-2rem))] min-w-(--radix-dropdown-menu-trigger-width) overflow-y-auto"
      >
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
              <span className="break-words">{item.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
