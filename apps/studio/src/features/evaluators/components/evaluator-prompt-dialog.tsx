"use client";

import {
  type PromptLibrary,
  PromptLibrarySchema,
} from "@kortyx/telemetry-contracts";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { promptRequest } from "@/features/prompts/api/client";
import { EditorField } from "./editor-fields";

export function EvaluatorPromptDialog({
  open,
  onOpenChange,
  name,
  onCreated,
  onRestoreFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestoreFocus: () => void;
  name: string;
  onCreated: (id: string, library: PromptLibrary) => void;
}) {
  const [key, setKey] = useState("");
  const [rubric, setRubric] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent
        className="max-h-[85dvh] max-w-xl overflow-y-auto"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        <div className="flex flex-col gap-1">
          <DialogTitle className="text-sm font-semibold">
            Create judge prompt
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Save a rubric in the shared Prompts library. Recorded evidence is
            supplied automatically.
          </DialogDescription>
        </div>
        <fieldset disabled={busy} className="flex flex-col gap-4">
          <EditorField id="judge-prompt-key" label="Prompt key">
            <Input
              id="judge-prompt-key"
              placeholder="evaluators/candidate-quality"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </EditorField>
          <EditorField id="judge-rubric" label="Rubric">
            <Textarea
              id="judge-rubric"
              rows={8}
              placeholder="Explain what a good response looks like and how to handle missing evidence."
              value={rubric}
              onChange={(e) => setRubric(e.target.value)}
            />
          </EditorField>
        </fieldset>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={busy || !rubric.trim() || !key.trim()}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const result = z.object({ id: z.uuid() }).parse(
                  await promptRequest("actions", {
                    action: "create",
                    key,
                    name: name ? `${name} rubric` : "Evaluation rubric",
                    categoryId: null,
                    note: "Created from evaluator configuration",
                    idempotencyKey: crypto.randomUUID(),
                    content: {
                      format: "system-user",
                      messages: [
                        { role: "system", content: rubric },
                        {
                          role: "user",
                          content:
                            "Assess this recorded evidence.\n{{evidence}}",
                        },
                      ],
                      variablesSchema: {
                        type: "object",
                        properties: { evidence: { type: "string" } },
                        required: ["evidence"],
                        additionalProperties: false,
                      },
                      configSchema: {
                        type: "object",
                        properties: {},
                        additionalProperties: false,
                      },
                      config: {},
                      dependencies: [],
                    },
                  }),
                );
                onCreated(
                  result.id,
                  PromptLibrarySchema.parse(await promptRequest("library")),
                );
                onOpenChange(false);
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Could not create prompt.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving…" : "Save prompt version"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
