"use client";
import {
  EvaluatorLibrarySchema,
  type EvaluatorReference,
  EvaluatorReferenceSchema,
} from "@kortyx/telemetry-contracts";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { evaluatorRequest } from "../api/client";

const BindingsSchema = z.object({
  bindings: z.array(
    z.object({
      evaluatorId: z.string(),
      evaluatorVersion: z.number(),
      suiteId: z.string(),
    }),
  ),
});
export function ExperimentEvaluators({
  targetId,
  suiteIds,
  disabled,
  onChange,
}: {
  targetId: string;
  suiteIds: string[];
  disabled: boolean;
  onChange: (refs: EvaluatorReference[] | undefined) => void;
}) {
  const [library, setLibrary] = useState<z.infer<
    typeof EvaluatorLibrarySchema
  > | null>(null);
  const [bindings, setBindings] = useState<
    z.infer<typeof BindingsSchema>["bindings"]
  >([]);
  const [inherit, setInherit] = useState(true);
  const [selected, setSelected] = useState<EvaluatorReference[]>([]);
  const [error, setError] = useState("");
  const suiteKey = suiteIds.join(",");
  useEffect(() => {
    if (!targetId) return;
    const abort = new AbortController();
    void Promise.all([
      evaluatorRequest("", undefined, abort.signal),
      evaluatorRequest(
        `dataset-defaults?${new URLSearchParams({ targetId, suiteIds: suiteKey })}`,
        undefined,
        abort.signal,
      ),
    ])
      .then(([lib, defaults]) => {
        setLibrary(EvaluatorLibrarySchema.parse(lib));
        setBindings(BindingsSchema.parse(defaults).bindings);
        setError("");
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setError(
            "Evaluator defaults could not be loaded. Refresh before launching to review the defaults.",
          );
      });
    return () => abort.abort();
  }, [targetId, suiteKey]);
  return (
    <fieldset
      disabled={disabled}
      className="flex flex-col gap-3 rounded-lg border p-3"
    >
      <legend className="px-1 text-xs font-medium">
        Additional evaluators
      </legend>
      <p className="text-xs text-muted-foreground">
        These judges assess saved results after the experiment. Existing checks
        and criterion verdicts are recorded separately.
      </p>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={inherit}
          onChange={(e) => {
            setInherit(e.target.checked);
            onChange(e.target.checked ? undefined : selected);
          }}
        />
        Use dataset evaluator defaults
      </label>
      {inherit ? (
        bindings.length ? (
          <ul className="flex flex-col gap-1 text-xs">
            {bindings.map((b) => (
              <li key={`${b.suiteId}:${b.evaluatorId}`}>
                {b.suiteId} ·{" "}
                {library?.evaluators.find((e) => e.id === b.evaluatorId)?.draft
                  .name ?? "Evaluator"}{" "}
                v{b.evaluatorVersion}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            No additional evaluator defaults are selected.
          </p>
        )
      ) : (
        library?.evaluators
          .filter((e) => !e.archived && e.publishedVersion > 0)
          .map((e) => (
            <label key={e.id} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={selected.some((ref) => ref.id === e.id)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [
                        ...selected,
                        EvaluatorReferenceSchema.parse({
                          id: e.id,
                          version: e.publishedVersion,
                        }),
                      ]
                    : selected.filter((ref) => ref.id !== e.id);
                  setSelected(next);
                  onChange(next);
                }}
              />
              {e.draft.name} · v{e.publishedVersion}
            </label>
          ))
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {!inherit && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setSelected([]);
            onChange([]);
          }}
        >
          Clear additional evaluators
        </Button>
      )}
    </fieldset>
  );
}
