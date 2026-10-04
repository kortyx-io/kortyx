import { ArrowRight, Code2, PanelsTopLeft } from "lucide-react";
import Link from "next/link";
import { DocsTrustFooter } from "@/components/docs/docs-trust-footer";
import { buildDocHref } from "@/lib/docs";
import { docsConfig } from "@/lib/docs/config";

export function DocsProductIndex() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-20"
    >
      <p className="mb-3 text-sm font-medium text-primary">
        Kortyx documentation
      </p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        What are you working with?
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
        Build your application with the SDK, then use Studio to understand its
        runs and evaluate workflow behavior.
      </p>
      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {docsConfig.products.map((product) => {
          const Icon = product.icon === "studio" ? PanelsTopLeft : Code2;
          return (
            <Link
              key={product.id}
              href={buildDocHref(product.id, product.latestVersion, [
                product.overview,
              ])}
              className="group flex flex-col rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/60 hover:bg-accent/40"
            >
              <span className="mb-5 w-fit rounded-lg bg-primary/10 p-3 text-primary">
                <Icon className="size-6" />
              </span>
              <h2 className="text-xl font-semibold">{product.label}</h2>
              <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">
                {product.description}
              </p>
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary">
                Explore documentation{" "}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          );
        })}
      </div>
      <DocsTrustFooter />
    </main>
  );
}
