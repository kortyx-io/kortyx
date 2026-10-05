"use client";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function OperatorScopeSwitcher({
  kind,
  selected,
  options,
}: {
  kind: "project" | "environment";
  selected: string;
  options: Array<{ id: string; name: string }>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={kind === "project" ? "Project" : "Telemetry environment"}
          className="max-w-44 shrink-0 font-normal"
        >
          <span className="truncate">
            {options.find((option) => option.id === selected)?.name}
          </span>
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>
          {kind === "project" ? "Projects" : "Environments"}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={selected}
          onValueChange={async (value) => {
            const response = await fetch("/auth/operator-scope", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ kind, value }),
            });
            if (response.ok) window.location.assign("/runs");
          }}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={option.id}>
              {option.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
