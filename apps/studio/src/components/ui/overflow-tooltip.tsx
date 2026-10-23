import { Children, isValidElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function OverflowText({
  children,
  className,
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const fullText = ariaLabel ?? textFromNode(children);
  return (
    <span
      title={fullText || undefined}
      className={cn(
        "min-w-0 line-clamp-2 whitespace-normal break-words",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function OverflowBlock({
  children,
  className,
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const fullText = ariaLabel ?? textFromNode(children);
  return (
    <div
      title={fullText || undefined}
      className={cn(
        "min-w-0 line-clamp-2 whitespace-normal break-words",
        className,
      )}
    >
      {children}
    </div>
  );
}

function textFromNode(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number")
        return String(child);
      if (!isValidElement<{ children?: ReactNode }>(child)) return "";
      return textFromNode(child.props.children);
    })
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
