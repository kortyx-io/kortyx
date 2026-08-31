import Link from "next/link";
import React from "react";

type BreadcrumbItem = {
  label: string;
  href: string;
};

type DocsBreadcrumbsProps = {
  items: BreadcrumbItem[];
};

export function DocsBreadcrumbs(props: DocsBreadcrumbsProps) {
  const { items } = props;

  return (
    <nav
      className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground"
      aria-label="Breadcrumb"
    >
      {items.map((crumb, index) => {
        const isLast = index === items.length - 1;
        return (
          <React.Fragment key={`${crumb.href}-${crumb.label}`}>
            {index > 0 ? (
              <span className="text-muted-foreground">/</span>
            ) : null}
            {isLast ? (
              <span className="truncate font-medium text-foreground">
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="inline-flex min-h-8 items-center truncate hover:text-foreground"
              >
                {crumb.label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
