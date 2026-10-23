"use client";

import type { EvalSuite } from "@kortyx/agent/evals";
import { FileText } from "lucide-react";
import { parseAsString } from "nuqs";
import type { ReactNode } from "react";
import { DetailInspectorDrawer } from "@/components/detail/detail-inspector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStudioQueryState } from "@/lib/nuqs";
import { studioFeature } from "@/usage/client";

/** Saved suite context is secondary to the conversation results. */
export function EvalSuiteDetails({
  title,
  suite,
  configuration,
  showTrigger = true,
}: {
  title: string;
  suite: EvalSuite;
  configuration: ReactNode;
  showTrigger?: boolean;
}) {
  const [selection, setSelection] = useStudioQueryState(
    "evalTab",
    parseAsString.withOptions({ shallow: true }),
  );
  const sections = [
    {
      id: "definition",
      title: "Saved definition from this run",
      content: (
        <div className="flex flex-col gap-3 p-4">
          <Badge variant="secondary">Saved snapshot</Badge>
          <p className="text-xs text-muted-foreground">
            {suite.cases.length} conversations ·{" "}
            {suite.cases.reduce((total, c) => total + c.steps.length, 0)} steps
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Open a conversation result to inspect the expectations used for that
            execution.
          </p>
        </div>
      ),
    },
    { id: "context", title: "Execution settings", content: configuration },
  ];
  // Existing context/definition links retain their destination without replacing results.
  if (selection === "context") sections.reverse();
  return (
    <>
      {showTrigger ? (
        <Button
          variant="secondary"
          size="sm"
          data-page-help="suite-details"
          onClick={() => {
            studioFeature("studio.inspect", {
              surface: "evals",
              action: "inspect",
              tab: "definition",
            });
            void setSelection("definition");
          }}
        >
          <FileText />
          Suite details
        </Button>
      ) : null}
      <DetailInspectorDrawer
        open={selection === "definition" || selection === "context"}
        onClose={() => {
          void setSelection(null);
        }}
        title="Suite details"
        description={title}
        closeLabel="Close suite details"
      >
        {sections.map((section) => (
          <section
            key={section.id}
            data-suite-details-section={section.id}
            data-detail-tab-content={section.id}
            aria-hidden="false"
            className="border-b last:border-b-0"
          >
            <h3
              data-page-help="header"
              className="px-4 pt-4 text-sm font-semibold"
            >
              {section.title}
            </h3>
            {section.content}
          </section>
        ))}
      </DetailInspectorDrawer>
    </>
  );
}
