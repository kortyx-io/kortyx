import { ArrowRight } from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buildDocHref } from "@/lib/docs";
import { docsConfig } from "@/lib/docs/config";
import { cn } from "@/lib/utils/cn";
import { docsAreaIcons } from "./docs-area-icons";
import { DocsTrustFooter } from "./docs-trust-footer";

export function DocsProductIndex() {
  return (
    <>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-20"
      >
        <p className="mb-3 text-sm font-medium text-primary">
          Kortyx documentation
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          What would you like to do?
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
          Build an agent, understand its runs, or set up Studio for your team.
          Choose the guide that fits your task.
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {docsConfig.products.map((product) => {
            const Icon = docsAreaIcons[product.icon];
            return (
              <Link
                key={product.id}
                href={buildDocHref(product.id, product.latestVersion, [
                  product.overview,
                ])}
                className={cn(
                  "group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  product.id === "cli" && "sm:col-span-2",
                )}
              >
                <Card className="h-full gap-4 transition-colors group-hover:bg-accent/40">
                  <CardHeader>
                    <span className="mb-2 w-fit rounded-lg bg-primary/10 p-3 text-primary">
                      <Icon className="size-6" aria-hidden="true" />
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {product.label}
                    </p>
                    <CardTitle>
                      <h2 className="text-xl font-semibold">
                        {product.entryLabel ?? product.label}
                      </h2>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <p className="text-sm leading-6 text-muted-foreground">
                      {product.description}
                    </p>
                  </CardContent>
                  <CardFooter className="gap-2 text-sm font-medium text-primary">
                    Open guide{" "}
                    <ArrowRight
                      className="size-4 transition-transform group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </CardFooter>
                </Card>
              </Link>
            );
          })}
        </div>
      </main>
      <DocsTrustFooter />
    </>
  );
}
