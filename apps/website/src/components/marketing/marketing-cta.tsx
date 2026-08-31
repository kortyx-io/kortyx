import { ArrowRight } from "lucide-react";
import Link from "next/link";

export function MarketingCta({
  title = "Write the workflow for your product.",
  description = "Kortyx carries stream events, checkpoints, and human responses between the workflow and React.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <section className="marketing-grid relative isolate border-t border-white/8 bg-[#08080c] text-white">
      <div className="marketing-orb marketing-orb-one" />
      <div className="marketing-container marketing-section-pad">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="marketing-cta-title">{title}</h2>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-base leading-7 text-white/44 sm:text-lg">
            {description}
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/docs/getting-started/quickstart-nextjs"
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-[#09090d] transition-transform hover:-translate-y-0.5"
            >
              Open the quickstart
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/examples"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.03] px-5 text-sm text-white/65 hover:bg-white/[0.06] hover:text-white"
            >
              Open the refund example
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
