"use client";

import type { EvalSuite } from "@kortyx/agent/evals";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { parseAsString } from "nuqs";
import { useCallback, useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { columnFilter } from "@/components/data-table/filter-fields";
import { DetailInspectorDrawer } from "@/components/detail/detail-inspector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStudioQueryState } from "@/lib/nuqs";
import { studioHelp } from "@/lib/studio-help";
import { studioFeature } from "@/usage/client";
import { displayName } from "../lib/presentation";
import type { EvalTargets } from "../schema";
import { EvalDetailHeader } from "./eval-detail-header";
import { EvalDisclosure } from "./eval-disclosure";
import { EvalJudgeInstructionsLink } from "./eval-judge-instructions-link";
import { EvalPayloadViewer } from "./eval-payload-viewer";
import { ConversationDefinition } from "./eval-suite-definition";

type Conversation = EvalSuite["cases"][number];
function expectations(c: Conversation) {
  return (
    c.steps
      .flatMap((step) => [
        ...(step.expect.criteria ?? []).map((criterion) =>
          typeof criterion === "string" ? criterion : criterion.text,
        ),
        ...(step.expect.checks ?? []).map((check) => displayName(check.type)),
        ...(step.expect.outputs ?? []).map(
          (output) => `Structured output: ${output.schemaId}`,
        ),
      ])
      .join(" · ") || "Response type"
  );
}

export function EvalSuiteDetail({
  suite,
  target,
  canRun,
  onBack,
  onRun,
}: {
  suite: EvalSuite;
  target: EvalTargets["targets"][number];
  canRun: boolean;
  onBack: () => void;
  onRun: () => void;
}) {
  const [caseId, setCaseId] = useStudioQueryState(
    "suiteCase",
    parseAsString.withOptions({ shallow: true }),
  );
  const [matching, setMatching] = useState(suite.cases);
  const onRows = useCallback(
    (rows: Conversation[]) =>
      setMatching((previous) =>
        previous.length === rows.length &&
        previous.every((c, i) => c.id === rows[i].id)
          ? previous
          : rows,
      ),
    [],
  );
  const selected = suite.cases.find((c) => c.id === caseId);
  const position = matching.findIndex((c) => c.id === caseId);
  const inspect = (id: string) => {
    studioFeature("studio.inspect", {
      surface: "evals",
      action: "inspect",
      tab: "definition",
    });
    void setCaseId(id);
  };
  const columns: DataTableColumn<Conversation, string>[] = [
    {
      key: "name",
      label: "Conversation",
      defaultWidth: 320,
      sortKey: "name",
      cellClassName: "[&>.table-cell-content]:line-clamp-none",
      filter: columnFilter(
        "name",
        "Conversation",
        "text",
        (c) => c.name ?? c.id,
      ),
      render: (c) => (
        <div>
          <Button
            variant="link"
            size="inline"
            className="max-w-full whitespace-normal text-left"
            onClick={() => inspect(c.id)}
            title={c.name ?? displayName(c.id)}
          >
            <span className="line-clamp-2 break-words">
              {c.name ?? displayName(c.id)}
            </span>
          </Button>
          <p
            className="line-clamp-1 break-all font-mono text-[11px] text-muted-foreground"
            title={c.id}
          >
            {c.id}
          </p>
        </div>
      ),
    },
    {
      key: "input",
      label: "Opening message",
      defaultWidth: 380,
      filter: columnFilter("input", "Opening message", "text", (c) =>
        "message" in c.steps[0] ? c.steps[0].message : "Respond to human input",
      ),
      render: (c) => (
        <p className="line-clamp-2 whitespace-normal break-words text-xs text-muted-foreground">
          {"message" in c.steps[0]
            ? c.steps[0].message
            : "Respond to human input"}
        </p>
      ),
    },
    {
      key: "steps",
      label: "Steps",
      defaultWidth: 100,
      sortKey: "steps",
      filter: columnFilter("steps", "Steps", "number", (c) => c.steps.length),
      render: (c) => <Badge variant="secondary">{c.steps.length}</Badge>,
    },
    {
      key: "expectations",
      label: "What is checked",
      defaultWidth: 420,
      filter: columnFilter(
        "expectations",
        "What is checked",
        "text",
        expectations,
      ),
      cellTitle: expectations,
      render: (c) => (
        <p className="line-clamp-2 whitespace-normal break-words text-xs">
          {expectations(c)}
        </p>
      ),
    },
    {
      key: "workflow",
      label: "Workflow",
      defaultWidth: 180,
      filter: columnFilter(
        "workflow",
        "Workflow",
        "text",
        (c) => c.workflowId ?? "Default workflow",
      ),
      render: (c) => (
        <span className="text-xs text-muted-foreground">
          {c.workflowId ?? "Default workflow"}
        </span>
      ),
    },
  ];
  return (
    <div data-eval-suite-id={suite.id} className="flex h-full min-h-0 flex-col">
      <div data-tour-surface="suite-definition" className="min-h-0 flex-1">
        <DataTable
          tableId="eval-suite-conversations"
          header={
            <EvalDetailHeader
              title={suite.name ?? displayName(suite.id)}
              description={`${target.name} · ${target.environment} · ${suite.cases.length} conversations`}
              backLabel="Suites"
              onBack={onBack}
              actions={
                <Button
                  size="sm"
                  disabled={!canRun || Boolean(target.error)}
                  onClick={onRun}
                >
                  <Play />
                  Run suite
                </Button>
              }
            />
          }
          columns={columns.map((column) => ({
            ...column,
            help: {
              label: column.label,
              documentationUrl: studioHelp.evals.documentationUrl,
              description: (
                {
                  name: "A conversation defined by the application. Select it to inspect one step at a time without leaving this table.",
                  input:
                    "The first scripted message or response in this conversation.",
                  steps:
                    "The number of scripted turns, including responses to human input requests.",
                  expectations:
                    "A summary of model criteria, deterministic assertions and required structured outputs. Open the conversation to read the exact expectations.",
                  workflow:
                    "The workflow selected by this case, or the application default when none is specified.",
                } as Record<string, string>
              )[column.key],
            },
          }))}
          data={[...suite.cases]}
          getRowKey={(c) => c.id}
          onRowClick={(c) => inspect(c.id)}
          onFilteredRowsChange={onRows}
          search={{ placeholder: "Search conversations…" }}
          query={{
            keys: {
              q: "suiteSearch",
              sort: "suiteSort",
              dir: "suiteDir",
              cursor: "suitePage",
              pageSize: "suitePageSize",
              filters: "suiteFilters",
            },
          }}
          scrollRestoreKey={`eval-suite:${target.id}:${suite.id}`}
        />
      </div>
      <DetailInspectorDrawer
        open={caseId !== null}
        onClose={() => void setCaseId(null)}
        title={
          selected?.name ??
          (selected ? displayName(selected.id) : "Conversation not found")
        }
        description={selected?.id ?? "Conversation definition"}
        closeLabel="Close conversation definition"
        footer={
          selected ? (
            <nav
              aria-label="Conversation navigation"
              className="flex w-full items-center justify-between gap-2"
            >
              <Button
                variant="outline"
                size="sm"
                disabled={position <= 0}
                onClick={() => inspect(matching[position - 1].id)}
              >
                <ChevronLeft />
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                {position >= 0
                  ? `${position + 1} of ${matching.length}`
                  : "Outside current filter"}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={position < 0 || position >= matching.length - 1}
                onClick={() => inspect(matching[position + 1].id)}
              >
                Next
                <ChevronRight />
              </Button>
            </nav>
          ) : null
        }
      >
        {selected ? (
          <div className="flex flex-col gap-5 p-4">
            <ConversationDefinition
              key={selected.id}
              compact
              conversation={selected}
              index={suite.cases.indexOf(selected)}
              scope="suite-definition"
              actions={
                <EvalJudgeInstructionsLink
                  source="target"
                  id={target.id}
                  context={{ suiteId: suite.id }}
                />
              }
            />
            <EvalDisclosure
              scope="suite-definition-raw"
              label="Case definition"
            >
              <EvalPayloadViewer
                scope="suite-definition-raw"
                value={selected}
                defaultMode="json"
              />
            </EvalDisclosure>
          </div>
        ) : (
          <p role="alert" className="p-4 text-sm">
            This conversation is no longer in the current suite. Close this
            panel and select another conversation.
          </p>
        )}
      </DetailInspectorDrawer>
    </div>
  );
}
