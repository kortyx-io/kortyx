"use client";

import { useMemo, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useWorkflowQuery } from "../hooks/use-workflow-query";
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
  const { params, selection, setParams, setSelection } = useWorkflowQuery();
  const [focusedWorkflow, setFocusedWorkflow] = useState<{
    id: string;
    request: number;
  }>();
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorPanelOpen, setInspectorPanelOpen] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  function selectItem(nextSelection: typeof selection) {
    void setSelection(nextSelection);
    setInspectorPanelOpen(true);
    if (isMobile) setInspectorOpen(true);
  }

  function selectWorkflow(id: string) {
    selectItem({ type: "workflow", id });
    setFocusedWorkflow((current) => ({
      id,
      request: (current?.request ?? 0) + 1,
    }));
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
      system={system}
      selection={selection}
      onSelect={selectItem}
      onClose={() => {
        setInspectorOpen(false);
        setInspectorPanelOpen(false);
      }}
    />
  );

  return (
    <div className="flex h-full min-h-[620px] overflow-hidden rounded-xl border bg-background shadow-sm">
      <div className="hidden md:block">{catalog}</div>
      <main className="flex min-w-0 flex-1 flex-col">
        <WorkflowToolbar
          mode={params.mode}
          metric={params.metric}
          selectedWorkflow={selectedWorkflow}
          refreshing={refreshing}
          inspectorPanelOpen={inspectorPanelOpen}
          onModeChange={(mode) => void setParams({ mode })}
          onMetricChange={(metric) => void setParams({ metric })}
          onRefresh={() => {
            setRefreshing(true);
            window.setTimeout(() => setRefreshing(false), 600);
          }}
          onOpenCatalog={() => setCatalogOpen(true)}
          onOpenInspector={() => setInspectorOpen(true)}
          onOpenInspectorPanel={() => setInspectorPanelOpen(true)}
        />
        <div className="min-h-0 flex-1">
          <WorkflowCanvas
            system={system}
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
        <SheetContent side="left" className="w-[300px] p-0">
          {catalog}
        </SheetContent>
      </Sheet>
      <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
        <SheetContent className="w-[340px] p-0">{inspector}</SheetContent>
      </Sheet>
    </div>
  );
}
