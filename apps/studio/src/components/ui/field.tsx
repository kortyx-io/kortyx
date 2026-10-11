import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Shared label/control spacing; avoid margins on individual inputs. */
export function Field({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="field"
      className={cn("grid min-w-0 gap-2", className)}
      {...props}
    />
  );
}

export function FieldLabel({
  className,
  htmlFor,
  children,
  ...props
}: ComponentProps<"label"> & { htmlFor: string }) {
  return (
    <label
      htmlFor={htmlFor}
      data-slot="field-label"
      className={cn("block text-sm font-medium", className)}
      {...props}
    >
      {children}
    </label>
  );
}
