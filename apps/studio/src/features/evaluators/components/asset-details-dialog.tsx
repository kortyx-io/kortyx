"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EditorField } from "./editor-fields";

const detailCopy = {
  judge: {
    name: "judge",
    label: "Judge name",
    id: "judge",
    content: "Instructions",
  },
  scoreGroup: {
    name: "score group",
    label: "Score group name",
    id: "score-group-details",
    content: "Output fields",
  },
};
export function AssetDetailsDialog({
  entity = "judge",
  open,
  onOpenChange,
  name: initialName,
  description: initialDescription,
  existing,
  submitLabel = "Save details",
  onSave,
  onRestoreFocus,
}: {
  entity?: keyof typeof detailCopy;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  description: string;
  existing: boolean;
  submitLabel?: string;
  onRestoreFocus: () => void;
  onSave: (metadata: { name: string; description: string }) => Promise<void>;
}) {
  const copy = detailCopy[entity];
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setName(initialName);
      setDescription(initialDescription);
      setError("");
    }
  }, [open, initialName, initialDescription]);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        <div className="flex flex-col gap-1">
          <DialogTitle className="text-sm font-semibold">
            {`${existing ? "Rename" : "Name"} ${copy.name}`}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Update the {copy.name}'s name and description. {copy.content} and
            saved versions are kept separately.
          </DialogDescription>
        </div>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!name.trim()) return;
            setBusy(true);
            setError("");
            try {
              await onSave({ name: name.trim(), description });
              onOpenChange(false);
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : `Could not update ${copy.name} details.`,
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy} className="flex flex-col gap-4">
            <EditorField id={`${copy.id}-name`} label={copy.label}>
              <Input
                id={`${copy.id}-name`}
                value={name}
                required
                maxLength={200}
                onChange={(event) => setName(event.target.value)}
              />
            </EditorField>
            <EditorField id={`${copy.id}-description`} label="Description">
              <Textarea
                id={`${copy.id}-description`}
                value={description}
                maxLength={2000}
                rows={3}
                onChange={(event) => setDescription(event.target.value)}
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
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy || !name.trim()}>
              {busy ? "Saving…" : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
