"use client";
import type { EvalSettings, ResolvedEvalSettings } from "@kortyx/agent/evals";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { studioHelp } from "@/lib/studio-help";
export const settingSource = (source?: string) =>
  ({
    run: "Run override",
    studio: "Studio default",
    sdk: "Application default",
    "sdk-default": "SDK default",
    "studio-default": "Studio built-in default",
  })[source ?? ""] ?? "Default";
const fields = [
  {
    key: "repetitions",
    label: "Attempts per conversation",
    help: "How many times to run each test conversation. Repeating it helps you see whether the app gives consistent answers.",
    unit: 1,
    max: 20,
  },
  {
    key: "concurrency",
    label: "Concurrent attempts across suites",
    help: "How many test attempts can run at the same time across all suites. Lower this if your app or AI provider cannot handle more requests.",
    unit: 1,
    max: 20,
  },
  {
    key: "caseTimeoutMs",
    label: "Case timeout (seconds)",
    help: "The time limit for one test conversation. The attempt stops if it takes longer than this.",
    unit: 1000,
    max: 2_147_483_647 / 1000,
  },
  {
    key: "runTimeoutMs",
    label: "Evaluation timeout (minutes)",
    help: "The time limit for the entire evaluation. This is separate from the time limit for one conversation.",
    unit: 60000,
    max: 2_147_483_647 / 60000,
  },
] as const;
export function EvalSettingsFields({
  resolved,
  overrides,
  onChange,
  disabled,
  supportsCaseTimeout = true,
  limits,
  overrideSource = "run",
}: {
  resolved: ResolvedEvalSettings;
  overrides: EvalSettings;
  onChange: (key: keyof EvalSettings, value: number | undefined) => void;
  overrideSource?: "run" | "studio";
  disabled?: boolean;
  supportsCaseTimeout?: boolean;
  limits?: {
    concurrency?: number;
    caseTimeoutMs?: number;
    runTimeoutMs?: number;
  };
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        const max = limits?.[field.key as keyof typeof limits];
        const value = overrides[field.key] ?? resolved.values[field.key];
        return (
          <div className="space-y-1.5" key={field.key}>
            <div className="flex items-center gap-1">
              <label
                className="text-xs font-medium"
                htmlFor={`eval-${field.key}`}
              >
                {field.label}
              </label>
              <HelpCircle
                help={{
                  ...studioHelp.evalSettings,
                  label: field.label,
                  description: field.help,
                }}
              />
            </div>
            <Input
              id={`eval-${field.key}`}
              type="number"
              min={1 / field.unit}
              step={1 / field.unit}
              max={max !== undefined ? max / field.unit : field.max}
              value={Number.isFinite(value) ? value / field.unit : ""}
              disabled={
                disabled ||
                (field.key === "caseTimeoutMs" && !supportsCaseTimeout)
              }
              onChange={(e) =>
                onChange(
                  field.key,
                  e.target.value === ""
                    ? undefined
                    : Number(e.target.value) * field.unit,
                )
              }
            />
            <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-muted-foreground">
              <span>
                {settingSource(
                  overrides[field.key] !== undefined
                    ? overrideSource
                    : resolved.sources[field.key],
                )}
              </span>
              {overrides[field.key] !== undefined && (
                <Button
                  type="button"
                  size="inline"
                  variant="link"
                  className="text-[11px]"
                  disabled={disabled}
                  onClick={() => onChange(field.key, undefined)}
                >
                  Reset to default
                </Button>
              )}
            </div>
            {max !== undefined && max < 2_147_483_647 && (
              <p className="text-[11px] text-muted-foreground">
                Maximum {max / field.unit}
                {field.unit === 1000
                  ? " seconds"
                  : field.unit === 60000
                    ? " minutes"
                    : ""}
              </p>
            )}
            {field.key === "caseTimeoutMs" && !supportsCaseTimeout && (
              <p className="text-[11px] text-muted-foreground">
                Update the application SDK to view and change its case timeout.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
