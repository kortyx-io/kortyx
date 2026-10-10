"use client";
import { StudioEvalTargetsResponseSchema } from "@kortyx/agent/evals";
import {
  type PromptDetail,
  PromptDetailSchema,
  type PromptLibrary,
} from "@kortyx/telemetry-contracts";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { evalRequest } from "@/features/evals/api/client";
import { promptRequest } from "../api/client";
import { PromptActionSurface } from "./prompt-action-surface";

type EvalTargets = ReturnType<typeof StudioEvalTargetsResponseSchema.parse>;

export function PromptPolicyDialog({
  asset,
  onClose,
  onDone,
}: {
  asset: PromptLibrary["assets"][number];
  onClose: () => void;
  onDone: () => Promise<unknown>;
}) {
  const [data, setData] = useState<{
    detail: PromptDetail;
    targets: EvalTargets;
  }>();
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [requireChangeNote, setRequireChangeNote] = useState(false);
  const [requireTest, setRequireTest] = useState(true);
  const [requiredReviews, setRequiredReviews] = useState("0");
  const [allowException, setAllowException] = useState(true);
  const [suites, setSuites] = useState<
    PromptDetail["policies"][number]["requiredSuites"]
  >([]);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      promptRequest(`assets/${asset.id}`, undefined, controller.signal),
      evalRequest("targets", undefined, controller.signal),
    ])
      .then(([detail, targets]) => {
        if (controller.signal.aborted) return;
        const loaded = {
          detail: PromptDetailSchema.parse(detail),
          targets: StudioEvalTargetsResponseSchema.parse(targets),
        };
        const existing = loaded.detail.policies[0];
        setRequireTest(existing?.requireTest ?? true);
        setRequireChangeNote(existing?.requireChangeNote ?? false);
        setRequiredReviews(String(existing?.requiredReviews ?? 0));
        setAllowException(existing?.allowException ?? true);
        setSuites(existing?.requiredSuites ?? []);
        setData(loaded);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load promotion policy.",
          );
      });
    return () => controller.abort();
  }, [asset.id]);
  const save = async (policy: PromptDetail["policies"][number]) => {
    setWorking(true);
    setError("");
    try {
      await promptRequest("actions", {
        action: "policy",
        id: asset.id,
        policy,
      });
      await onDone();
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save promotion policy.",
      );
    } finally {
      setWorking(false);
    }
  };
  return (
    <PromptActionSurface
      modal
      open
      busy={working}
      onClose={onClose}
      title="Promotion policy"
      closeLabel="Close promotion policy"
      description={`${asset.name} · ${asset.key}`}
      actions={
        <Button
          size="sm"
          form="prompt-policy-form"
          type="submit"
          disabled={
            !data ||
            working ||
            !/^\d+$/.test(requiredReviews) ||
            Number(requiredReviews) > 10
          }
        >
          {working ? "Saving…" : "Save policy"}
        </Button>
      }
    >
      {!data ? (
        <div className="p-5 text-xs">
          {error ? (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          ) : (
            <output>Loading promotion policy…</output>
          )}
        </div>
      ) : (
        <form
          id="prompt-policy-form"
          className="space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (
              !data ||
              working ||
              !/^\d+$/.test(requiredReviews) ||
              Number(requiredReviews) > 10
            )
              return;
            void save({
              revision: data.detail.policies[0]?.revision ?? 0,
              requireTest,
              requireChangeNote,
              requiredReviews: Number(requiredReviews),
              allowException,
              requiredSuites: suites,
            });
          }}
        >
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <fieldset disabled={working} className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Applies to all versions of {asset.name}. Other prompts keep their
              own policies.
            </p>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={requireChangeNote}
                onChange={(event) => setRequireChangeNote(event.target.checked)}
              />
              Require a change note when saving a new version
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={requireTest}
                onChange={(event) => setRequireTest(event.target.checked)}
              />
              Require a passing full suite with verified prompt usage
            </label>
            <div className="space-y-2">
              <label htmlFor="policy-reviews" className="text-xs font-medium">
                Independent human reviews
              </label>
              <Input
                id="policy-reviews"
                type="number"
                min={0}
                max={10}
                value={requiredReviews}
                onChange={(event) => setRequiredReviews(event.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={allowException}
                onChange={(event) => setAllowException(event.target.checked)}
              />
              Allow explicit, audited exceptions
            </label>
            <div className="space-y-2">
              <p className="text-xs font-medium">Required suites</p>
              <p className="text-[11px] text-muted-foreground">
                All selected suites must pass using the version being promoted
                and the current live companion prompts.
              </p>
              <div className="max-h-64 space-y-2 overflow-auto rounded-md border p-3 [scrollbar-width:thin]">
                {suites
                  .filter(
                    (item) =>
                      !data.targets.targets.some(
                        (target) =>
                          target.id === item.targetId &&
                          target.manifest?.suites.some(
                            (suite) => suite.id === item.suiteId,
                          ),
                      ),
                  )
                  .map((item) => (
                    <label
                      key={`${item.targetId}:${item.suiteId}`}
                      className="flex items-start gap-2 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked
                        onChange={() =>
                          setSuites((current) =>
                            current.filter(
                              (suite) =>
                                suite.targetId !== item.targetId ||
                                suite.suiteId !== item.suiteId,
                            ),
                          )
                        }
                      />
                      <span>
                        {item.suiteId}
                        <span className="block text-muted-foreground">
                          {item.targetId} · Currently unavailable; uncheck to
                          remove
                        </span>
                      </span>
                    </label>
                  ))}
                {data.targets.targets.flatMap((target) =>
                  (target.manifest?.suites ?? []).map((suite) => {
                    const checked = suites.some(
                      (item) =>
                        item.targetId === target.id &&
                        item.suiteId === suite.id,
                    );
                    return (
                      <label
                        key={`${target.id}:${suite.id}`}
                        className="flex items-start gap-2 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={working}
                          onChange={() =>
                            setSuites((current) =>
                              checked
                                ? current.filter(
                                    (item) =>
                                      item.targetId !== target.id ||
                                      item.suiteId !== suite.id,
                                  )
                                : [
                                    ...current,
                                    { targetId: target.id, suiteId: suite.id },
                                  ],
                            )
                          }
                        />
                        <span>
                          {suite.id}
                          <span className="block text-[11px] text-muted-foreground">
                            {target.name ?? target.id} · {target.environment}
                          </span>
                        </span>
                      </label>
                    );
                  }),
                )}
                {!data.targets.targets.some(
                  (target) => target.manifest?.suites.length,
                ) && (
                  <p className="text-xs text-muted-foreground">
                    Connect an application to choose required suites.
                  </p>
                )}
              </div>
            </div>
          </fieldset>
        </form>
      )}
    </PromptActionSurface>
  );
}
