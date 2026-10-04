"use client";

import { Code2, PanelsTopLeft } from "lucide-react";
import Link from "next/link";
import { CheckIcon } from "@/components/icons/check-icon";
import { ChevronsUpDownIcon } from "@/components/icons/chevrons-up-down-icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils/cn";

export type ProductTarget = {
  product: string;
  label: string;
  description: string;
  icon: "sdk" | "studio";
  href: string;
};

export function DocsProductSelector({
  options,
  selectedProduct,
}: {
  options: ProductTarget[];
  selectedProduct: string;
}) {
  const selected = options.find((option) => option.product === selectedProduct);
  const Icon = selected?.icon === "studio" ? PanelsTopLeft : Code2;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          aria-label={`Select product: ${selected?.label ?? selectedProduct}`}
          className="h-auto w-full cursor-pointer justify-between rounded-lg border border-border px-3 py-3"
        >
          <span className="flex items-center gap-3">
            <span className="rounded-md bg-primary/10 p-2 text-primary">
              <Icon className="size-5" />
            </span>
            <span className="text-left">
              <span className="block text-base font-semibold">
                {selected?.label}
              </span>
              <span className="block text-xs text-muted-foreground">
                Documentation
              </span>
            </span>
          </span>
          <ChevronsUpDownIcon className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-(--radix-dropdown-menu-trigger-width) min-w-0 space-y-1"
      >
        {options.map((option) => {
          const ProductIcon = option.icon === "studio" ? PanelsTopLeft : Code2;
          const active = option.product === selectedProduct;
          return (
            <DropdownMenuItem key={option.product} asChild>
              <Link
                href={option.href}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex cursor-pointer items-start gap-3 px-2 py-3",
                  active && "bg-accent",
                )}
              >
                <ProductIcon className="mt-0.5 size-5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {option.label}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {option.description}
                  </span>
                </span>
                {active && (
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                )}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
