"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useWorkflowQuery } from "../hooks/use-workflow-query";
import { CONNECTION_STYLE } from "../lib/connection-style";
import { workflowCanvasFocusId } from "../lib/view-state";
import { withWorkflowCallEvidence } from "../lib/workflow-calls";
import type { WorkflowSystem } from "../schema";
import { WorkflowCanvas } from "./workflow-canvas";
import { WorkflowCatalog } from "./workflow-catalog";
import { WorkflowInspector } from "./workflow-inspector";
import { WorkflowToolbar } from "./workflow-toolbar";

export default function WorkflowsPageClient({
  system,
}: {
  system: WorkflowSystem;
}) {
  const isMobile = useIsMobile();
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const { params, selection, setParams, setSelection, setTimeRange } =
    useWorkflowQuery(system.transitions);
  const [focusedWorkflow, setFocusedWorkflow] = useState<{
    id: string;
    request: number;
    sourceKey: string;
  }>();
  const [showCalls, setShowCalls] = useState(true);
  const canvasSystem = useMemo(
    () => withWorkflowCallEvidence(system, showCalls),
    [system, showCalls],
  );
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorPanelOpen, setInspectorPanelOpen] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  const selectedWorkflowId =
    selection.type === "workflow"
      ? selection.id
      : selection.type === "node"
        ? selection.workflowId
        : undefined;
  const selectedWorkflow = system.workflows.find(
    (workflow) => workflow.id === selectedWorkflowId,
  );
  const workflows = useMemo(() => {
    const normalized = params.q.trim().toLowerCase();
    return system.workflows.filter((workflow) => {
      const text = [
        workflow.name,
        workflow.description,
        workflow.activeVersion,
        ...(workflow.tags ?? []),
        ...workflow.nodes.flatMap((node) => [
          node.id,
          node.label,
          node.provider,
          node.model,
        ]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        (params.health === "all" || workflow.health === params.health) &&
        (!normalized || text.includes(normalized))
      );
    });
  }, [params.health, params.q, system.workflows]);
  const canvasFocusId = workflowCanvasFocusId(selection, params.workflow);
  const canvasFocusKey = `${canvasFocusId}:${params.node}:${params.transition}`;

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!system.workflows.some((workflow) => workflow.id === canvasFocusId)) {
      return;
    }
    setFocusedWorkflow((current) => ({
      id: canvasFocusId,
      request: (current?.request ?? 0) + 1,
      sourceKey: canvasFocusKey,
    }));
  }, [canvasFocusKey, canvasFocusId, system.workflows]);

  function selectItem(nextSelection: typeof selection) {
    void setSelection(nextSelection);
    setInspectorPanelOpen(true);
    if (isMobile) setInspectorOpen(true);
  }

  function selectWorkflow(id: string) {
    selectItem({ type: "workflow", id });
    setCatalogOpen(false);
  }

  const catalog = (
    <WorkflowCatalog
      system={system}
      workflows={workflows}
      query={params.q}
      health={params.health}
      selectedWorkflowId={selectedWorkflowId}
      onQueryChange={(q) => void setParams({ q })}
      onHealthChange={(health) => void setParams({ health })}
      onSelectWorkflow={selectWorkflow}
      onClear={() => void setParams({ q: null, health: null })}
    />
  );
  const inspector = (
    <WorkflowInspector
      system={canvasSystem}
      selection={selection}
      onSelect={selectItem}
      onNavigate={() => {
        setInspectorOpen(false);
        setCatalogOpen(false);
      }}
      onClose={() => {
        setInspectorOpen(false);
        setInspectorPanelOpen(false);
      }}
    />
  );

  return (
    <div
      data-workflows-ready={hydrated ? "true" : "false"}
      className="flex h-full min-h-[620px] overflow-hidden rounded-xl border bg-background shadow-sm"
    >
      <div className="hidden md:block">{catalog}</div>
      <main className="flex min-w-0 flex-1 flex-col">
        <WorkflowToolbar
          mode={params.mode}
          metric={params.metric}
          selectedWorkflow={selectedWorkflow}
          refreshing={refreshing}
          inspectorPanelOpen={inspectorPanelOpen}
          range={params.range}
          startedAfter={params.startedAfter}
          startedBefore={params.startedBefore}
          version={params.version}
          onModeChange={(mode) => void setParams({ mode })}
          onMetricChange={(metric) => void setParams({ metric })}
          onTimeRangeChange={(value) => void setTimeRange(value)}
          onVersionChange={(version) =>
            void setParams({ version: version || null }, { shallow: false })
          }
          onRefresh={() => startRefresh(() => router.refresh())}
          onOpenCatalog={() => setCatalogOpen(true)}
          onOpenInspector={() => setInspectorOpen(true)}
          onOpenInspectorPanel={() => setInspectorPanelOpen(true)}
        />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b px-4 py-2 text-xs text-muted-foreground">
          <fieldset
            aria-label="Workflow connection legend"
            className="flex flex-wrap items-center gap-x-4 gap-y-2"
          >
            {(
              [
                ["call", "useWorkflow · child call + return"],
                ["handoff", "transitionTo · handoff"],
              ] as const
            ).map(([kind, label]) => (
              <span key={kind} className="inline-flex items-center gap-2">
                <svg width="28" height="8" aria-hidden="true">
                  <line
                    x1="1"
                    y1="4"
                    x2="27"
                    y2="4"
                    stroke={CONNECTION_STYLE[kind].color}
                    strokeWidth="2"
                    strokeDasharray={CONNECTION_STYLE[kind].dashArray}
                  />
                </svg>
                {label}
              </span>
            ))}
          </fieldset>
          <label
            className="ml-auto flex items-center gap-2"
            title="Overlay recorded calls on source-discovered paths"
          >
            <input
              type="checkbox"
              checked={showCalls}
              onChange={(event) => setShowCalls(event.target.checked)}
              className="accent-violet-500"
            />
            Observed calls
            <span className="rounded bg-violet-500/10 px-1.5 text-violet-600">
              {system.observedCalls?.length ?? 0}
            </span>
          </label>
        </div>
        <div className="min-h-0 flex-1">
          <WorkflowCanvas
            system={canvasSystem}
            mode={params.mode}
            metric={params.metric}
            selection={selection}
            focusedWorkflow={focusedWorkflow}
            onSelect={selectItem}
          />
        </div>
      </main>
      <div
        className={cn(
          "hidden h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] lg:block",
          inspectorPanelOpen ? "w-[320px]" : "w-0",
        )}
      >
        {inspector}
      </div>
      <Sheet open={catalogOpen} onOpenChange={setCatalogOpen}>
        <SheetContent
          side="left"
          className="w-[300px] p-0"
          aria-describedby={undefined}
        >
          <SheetTitle className="sr-only">Workflow catalog</SheetTitle>
          {catalog}
        </SheetContent>
      </Sheet>
      <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
        <SheetContent className="w-[340px] p-0" aria-describedby={undefined}>
          <SheetTitle className="sr-only">Workflow inspector</SheetTitle>
          {inspector}
        </SheetContent>
      </Sheet>
    </div>
  );
}
