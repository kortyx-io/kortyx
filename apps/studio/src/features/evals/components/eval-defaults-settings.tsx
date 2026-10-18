"use client";
import {
  type EvalSettings,
  EvalSettingsResponseSchema,
  resolveEvalSettings,
} from "@kortyx/agent/evals";
import { FlaskConical } from "lucide-react";
import { useEffect, useState } from "react";
import { SettingsCard } from "@/components/settings/settings-card";
import { Button } from "@/components/ui/button";
import { evalRequest } from "../api/client";
import { EvalDropdown } from "./eval-dropdown";
import { EvalSettingsFields } from "./eval-settings-fields";
export function EvalDefaultsSettings() {
  const [settings, setSettings] =
    useState<ReturnType<typeof EvalSettingsResponseSchema.parse>>();
  const [draft, setDraft] = useState<EvalSettings>({});
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void evalRequest("settings", undefined, controller.signal)
      .then((value) => {
        const next = EvalSettingsResponseSchema.parse(value);
        setSettings(next);
        setDraft(next.defaults);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(String(error));
      });
    return () => controller.abort();
  }, []);
  const baseline = resolveEvalSettings(
    {},
    {},
    {
      defaults: {},
      limits: {},
      overrides: ["repetitions", "concurrency", "caseTimeoutMs"],
    },
    settings?.installation,
  );
  const change = (
    key: keyof EvalSettings,
    value: number | string | undefined,
  ) => {
    setSaved(false);
    setDraft((previous) => {
      const next = { ...previous, [key]: value };
      if (value === undefined) delete next[key];
      return next as EvalSettings;
    });
  };
  const save = async () => {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const next = EvalSettingsResponseSchema.parse(
        await evalRequest("settings", draft),
      );
      setSettings(next);
      setDraft(next.defaults);
      setSaved(true);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save evaluation defaults.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsCard
      icon={FlaskConical}
      title="Evaluations"
      description="Project defaults shared by Studio and CLI launches. Run overrides take precedence; application limits still apply."
      className="xl:col-span-2"
    >
      {error && (
        <p
          role="alert"
          data-page-help-state="error"
          className="mb-3 text-sm text-red-700 dark:text-red-400"
        >
          {error}
        </p>
      )}
      {settings ? (
        <div className="space-y-4">
          <EvalSettingsFields
            resolved={baseline}
            overrideSource="studio"
            overrides={draft}
            onChange={change}
            disabled={busy || !settings.canEdit}
            limits={{ runTimeoutMs: settings.maxRunTimeoutMs }}
          />
          <div className="max-w-sm space-y-2">
            <p className="text-xs font-medium">Judge</p>
            <EvalDropdown
              label="Default judge"
              value={draft.judge ?? "studio"}
              disabled={busy || !settings.canEdit}
              options={[
                { value: "studio", label: "Studio judge" },
                { value: "app", label: "App judge" },
              ]}
              onChange={(value) => change("judge", value)}
            />
            {draft.judge && (
              <Button
                size="inline"
                variant="link"
                disabled={busy || !settings.canEdit}
                onClick={() => change("judge", undefined)}
              >
                Reset to default
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Only values you change are saved. Application defaults are resolved
            for the selected application when launching. Reset a field to use
            its application default.
          </p>
          <div className="flex items-center gap-3">
            <Button
              disabled={busy || !settings.canEdit}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save evaluation defaults"}
            </Button>
            {saved && (
              <output className="text-xs">Evaluation defaults saved.</output>
            )}
            {!settings.canEdit && (
              <p className="text-xs text-muted-foreground">
                Changing project defaults requires studio:write permission.
              </p>
            )}
          </div>
        </div>
      ) : (
        !error && (
          <p className="text-sm text-muted-foreground">
            Loading evaluation defaults…
          </p>
        )
      )}
    </SettingsCard>
  );
}
