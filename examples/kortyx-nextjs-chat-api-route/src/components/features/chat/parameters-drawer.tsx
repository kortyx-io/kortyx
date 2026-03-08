"use client";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type ParametersDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  includeHistory: boolean;
  onIncludeHistoryChange: (value: boolean) => void;
  workflowId: string;
  onWorkflowIdChange: (value: string) => void;
};

export function ParametersDrawer({
  open,
  onOpenChange,
  includeHistory,
  onIncludeHistoryChange,
  workflowId,
  onWorkflowIdChange,
}: ParametersDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerOverlay open={open} onClick={() => onOpenChange(false)} />
      <DrawerContent open={open} position="center">
        <DrawerHeader>
          <DrawerTitle>Parameters</DrawerTitle>
          <DrawerClose onClick={() => onOpenChange(false)} />
        </DrawerHeader>
        <div className="p-6 space-y-6">
          <div className="p-4 space-y-2 border rounded-lg bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
            <div className="space-y-1">
              <Label htmlFor="workflow-id" className="text-sm font-medium">
                Workflow override
              </Label>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                If set, runs that workflow id (e.g.{" "}
                <code>reason-interrupt-structured</code>). Leave empty to use
                the default workflow.
              </p>
            </div>
            <Input
              id="workflow-id"
              value={workflowId}
              placeholder="general-chat"
              onChange={(e) => onWorkflowIdChange(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between p-4 space-x-4 border rounded-lg bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
            <div className="flex-1 space-y-1">
              <Label
                htmlFor="include-history"
                className="text-sm font-medium cursor-pointer"
              >
                Include Message History{" "}
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  ({includeHistory ? "On" : "Off"})
                </span>
              </Label>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                When enabled, sends full conversation history to the API. When
                disabled, only the last message is sent.
              </p>
            </div>
            <Switch
              id="include-history"
              checked={includeHistory}
              onCheckedChange={onIncludeHistoryChange}
            />
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
