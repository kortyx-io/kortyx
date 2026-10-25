import { Children, isValidElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function OverflowText({
  children,
  className,
  ariaLabel,
  nativeTitle = true,
}: {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  nativeTitle?: boolean;
}) {
  const fullText = ariaLabel ?? textFromNode(children);
  return (
    <span
      title={nativeTitle ? fullText || undefined : undefined}
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
  nativeTitle = true,
}: {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  nativeTitle?: boolean;
}) {
  const fullText = ariaLabel ?? textFromNode(children);
  return (
    <div
      title={nativeTitle ? fullText || undefined : undefined}
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
