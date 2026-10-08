"use client";
import {
  type PromptBundle,
  PromptBundleSchema,
  PromptDetailSchema,
} from "@kortyx/telemetry-contracts";
import { useEffect, useState } from "react";
import { z } from "zod";
import { DetailInspectorDrawer } from "@/components/detail/detail-inspector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EvalDropdown } from "@/features/evals/components/eval-dropdown";
import { promptRequest } from "../api/client";
import { downloadJson } from "../lib/presentation";

const mappingSchema = z.object({
  sourceKey: z.string(),
  sourceVersion: z.number(),
  key: z.string(),
  promptId: z.uuid(),
  version: z.number(),
  hash: z.string(),
  reuse: z.boolean().optional(),
});
const planSchema = z.object({
  id: z.uuid(),
  bundleHash: z.string(),
  expiresAt: z.string(),
  mapping: z.array(mappingSchema),
  assignmentsChanged: z.literal(false),
});
export function PromptImport({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [bundle, setBundle] = useState<PromptBundle | null>(null),
    [plan, setPlan] = useState<z.infer<typeof planSchema> | null>(null),
    [conflicts, setConflicts] = useState("error"),
    [rename, setRename] = useState<Record<string, string>>({}),
    [groups, setGroups] = useState(false),
    [categories, setCategories] = useState(true),
    [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [applied, setApplied] = useState(false);
  useEffect(() => {
    if (!open && applied) {
      setApplied(false);
      setPlan(null);
      setBundle(null);
      setRename({});
    }
  }, [open, applied]);
  const resetPlan = () => {
    setPlan(null);
    setApplied(false);
    setError("");
  };
  const prepare = async () => {
    setWorking(true);
    setError("");
    try {
      setPlan(
        planSchema.parse(
          await promptRequest("transfers/plan", {
            bundle,
            conflicts,
            rename,
            categories,
            groups,
          }),
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Import planning failed.",
      );
    } finally {
      setWorking(false);
    }
  };
  const apply = async () => {
    if (!plan) return;
    setWorking(true);
    setError("");
    try {
      await promptRequest(`transfers/${plan.id}/apply`, {
        bundleHash: plan.bundleHash,
      });
      for (const item of plan.mapping) {
        const detail = PromptDetailSchema.parse(
          await promptRequest(
            `assets/${item.promptId}?version=${item.version}`,
          ),
        );
        if (
          !detail.versions.some(
            (version) =>
              version.version === item.version && version.hash === item.hash,
          )
        )
          throw new Error(
            "Destination verification failed. Retain the plan and retry this import.",
          );
      }
      await onDone();
      setApplied(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Import failed. Retain the plan and retry.",
      );
    } finally {
      setWorking(false);
    }
  };
  return (
    <DetailInspectorDrawer
      open={open}
      onClose={() => {
        if (!working) onClose();
      }}
      title="Import prompts"
      description="Review a portable bundle, apply it to this project, and verify the saved versions."
      closeLabel="Close prompt import"
    >
      <div className="space-y-5 p-5">
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        {applied ? (
          <div
            aria-live="polite"
            className="space-y-3 rounded-lg border p-4 text-xs"
          >
            <p className="font-medium">Import verified</p>
            <p>
              All destination versions match the reviewed hashes. Run your
              application’s eval suite here before promoting them.
            </p>
            <Button size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : plan ? (
          <>
            <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-xs">
              <p className="font-medium">
                Review import · {plan.mapping.length} versions
              </p>
              <p>
                Source: {bundle?.origin.apiUrl} · {bundle?.origin.projectId}
              </p>
              <p className="text-muted-foreground">
                Production assignments stay unchanged. Plan expires{" "}
                {new Date(plan.expiresAt).toLocaleString()}.
              </p>
            </div>
            <ul className="space-y-3">
              {plan.mapping.map((item) => (
                <li
                  key={`${item.sourceKey}:${item.sourceVersion}`}
                  className="min-w-0 space-y-2 rounded-lg border p-3 text-xs"
                >
                  <p className="break-all font-mono">
                    {item.sourceKey} · v{item.sourceVersion} → {item.key} · v
                    {item.version}
                  </p>
                  <p className="text-muted-foreground">
                    {item.reuse
                      ? "Reuse identical version"
                      : "Save destination candidate"}
                  </p>
                  <p className="break-all font-mono text-[11px] text-muted-foreground">
                    {item.hash}
                  </p>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={working}
                onClick={() => setPlan(null)}
              >
                Change options
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadJson("prompt-transfer-plan.json", plan)}
              >
                Save plan for retry
              </Button>
              <Button size="sm" disabled={working} onClick={() => void apply()}>
                {working ? "Applying & verifying…" : "Apply reviewed import"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <label
                htmlFor="prompt-bundle-file"
                className="text-xs font-medium"
              >
                Portable prompt bundle
              </label>
              <Input
                id="prompt-bundle-file"
                type="file"
                accept=".json,application/json"
                disabled={working}
                onChange={async (event) => {
                  resetPlan();
                  setBundle(null);
                  setRename({});
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    if (file.size > 20 * 1024 * 1024)
                      throw new Error("Choose a bundle smaller than 20 MiB.");
                    setBundle(
                      PromptBundleSchema.parse(JSON.parse(await file.text())),
                    );
                  } catch (cause) {
                    setError(
                      cause instanceof z.ZodError
                        ? "This file is not a supported portable prompt bundle."
                        : cause instanceof Error
                          ? cause.message
                          : "Could not read this bundle.",
                    );
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Export a bundle from Studio or the CLI. Credentials,
                assignments, evals, and reviews are excluded.
              </p>
            </div>
            {bundle && (
              <>
                <p className="text-xs">
                  {bundle.prompts.length} prompts ·{" "}
                  {bundle.prompts.reduce(
                    (count, prompt) => count + prompt.versions.length,
                    0,
                  )}{" "}
                  versions
                </p>
                <EvalDropdown
                  label="Conflicting content"
                  className="w-full"
                  value={conflicts}
                  options={[
                    {
                      value: "error",
                      label: "Stop on different existing content",
                    },
                    {
                      value: "append",
                      label: "Explicitly append new candidate versions",
                    },
                  ]}
                  onChange={(value) => {
                    setConflicts(value);
                    resetPlan();
                  }}
                />
                <details className="space-y-3 rounded-lg border p-3">
                  <summary className="cursor-pointer text-xs font-medium">
                    Change destination keys
                  </summary>
                  {bundle.prompts.map((prompt) => (
                    <div key={prompt.key} className="mt-3 space-y-1">
                      <label
                        htmlFor={`import-key-${prompt.key}`}
                        className="break-all text-xs"
                      >
                        {prompt.key}
                      </label>
                      <Input
                        id={`import-key-${prompt.key}`}
                        value={rename[prompt.key] ?? prompt.key}
                        onChange={(event) => {
                          setRename((current) => ({
                            ...current,
                            [prompt.key]: event.target.value,
                          }));
                          resetPlan();
                        }}
                      />
                    </div>
                  ))}
                </details>
                <label className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={categories}
                    onChange={(event) => {
                      setCategories(event.target.checked);
                      resetPlan();
                    }}
                  />
                  Recreate category paths for new prompts
                </label>
                {bundle.groups.length > 0 && (
                  <label className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={groups}
                      onChange={(event) => {
                        setGroups(event.target.checked);
                        resetPlan();
                      }}
                    />
                    Include {bundle.groups.length} test groups with remapped
                    versions
                  </label>
                )}
              </>
            )}
            <Button
              size="sm"
              disabled={!bundle || working}
              onClick={() => void prepare()}
            >
              {working ? "Planning…" : "Review import plan"}
            </Button>
          </>
        )}
      </div>
    </DetailInspectorDrawer>
  );
}
