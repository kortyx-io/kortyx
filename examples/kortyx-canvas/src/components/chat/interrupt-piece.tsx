"use client";

import type { HumanInputPiece } from "@kortyx/react";
import { useState } from "react";
import { AsyncSearchSelect } from "@/components/ui/async-search-select";
import {
  CONFIRM_REMOVAL_INTERRUPT_ID,
  CONFIRM_SAVE_INTERRUPT_ID,
  PICK_AGENT_INTERRUPT_ID,
  PICK_BRIEF_INTERRUPT_ID,
} from "@/lib/protocol";
import {
  type AgentPickerOption,
  type BriefPickerOption,
  searchAgentsForDiscoveryCanvas,
  searchBriefsForDiscoveryCanvas,
} from "@/services/actions";

/**
 * Shortlist passed via the interrupt's `meta` field when the resolver got
 * multiple search hits. Rendered as buttons above the free-text picker so
 * the user can disambiguate in one click; falling back to the picker if
 * none of the shortlisted entries are right.
 */
type ResolverCandidate = { id: string; label: string };

function readCandidates(piece: HumanInputPiece): ResolverCandidate[] {
  const raw = piece.meta?.candidates;
  if (!Array.isArray(raw)) return [];
  const out: ResolverCandidate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.id !== "string" || typeof rec.label !== "string") continue;
    out.push({ id: rec.id, label: rec.label });
  }
  return out;
}

type InterruptResponse = { selected: string[]; text: string };

type RespondHandler = (
  piece: HumanInputPiece,
  response: InterruptResponse,
) => void;

type Props = {
  piece: HumanInputPiece;
  onRespond: RespondHandler;
  /**
   * True when this interrupt has already been answered (it's been re-rendered
   * from chat history, not from a live in-flight stream). When set,
   * `answeredLabel` is shown in a disabled select-like row.
   */
  disabled?: boolean;
  answeredLabel?: string;
};

export function InterruptPiece({
  piece,
  onRespond,
  disabled,
  answeredLabel,
}: Props) {
  const kind = piece.schemaId ?? piece.interruptId;

  if (kind === PICK_BRIEF_INTERRUPT_ID || kind === PICK_AGENT_INTERRUPT_ID) {
    if (disabled) {
      return (
        <ResolvedPickerShell
          question={piece.question}
          label={answeredLabel ?? "(no selection)"}
        />
      );
    }
    return kind === PICK_BRIEF_INTERRUPT_ID ? (
      <BriefPickerPiece piece={piece} onRespond={onRespond} />
    ) : (
      <AgentPickerPiece piece={piece} onRespond={onRespond} />
    );
  }

  if (kind === CONFIRM_REMOVAL_INTERRUPT_ID) {
    if (piece.kind === "multi-choice") {
      return (
        <ConfirmBulkRemovalPiece
          piece={piece}
          onRespond={onRespond}
          disabled={disabled}
          answeredLabel={answeredLabel}
        />
      );
    }
    return (
      <ConfirmRemovalPiece
        piece={piece}
        onRespond={onRespond}
        disabled={disabled}
        answeredLabel={answeredLabel}
      />
    );
  }

  if (kind === CONFIRM_SAVE_INTERRUPT_ID) {
    return (
      <ConfirmSavePiece
        piece={piece}
        onRespond={onRespond}
        disabled={disabled}
        answeredLabel={answeredLabel}
      />
    );
  }

  return (
    <div className="rounded-2xl rounded-bl-sm bg-muted px-3.5 py-3 text-xs text-muted-foreground">
      Unknown picker ({kind ?? "no schemaId"})
    </div>
  );
}

/**
 * Save/Cancel confirmation rendered for the `confirm-save` interrupt — the
 * prompt-initiated counterpart of the canvas Save button. The primary
 * action ("save") is styled with the positive primary color (not the
 * destructive red used by `ConfirmRemovalPiece`) since this commits, not
 * deletes.
 */
function ConfirmSavePiece({
  piece,
  onRespond,
  disabled,
  answeredLabel,
}: {
  piece: HumanInputPiece;
  onRespond: RespondHandler;
  disabled?: boolean | undefined;
  answeredLabel?: string | undefined;
}) {
  // `confirm-save-node` streams the confirmation message via `useReason`
  // before raising this interrupt, then ships an empty `question` so the
  // chips render flush against the streamed message. No fallback string —
  // a localized chat-message is the contract.
  const question = piece.question ?? "";
  const options =
    piece.options.length > 0
      ? piece.options
      : [
          { id: "save", label: "Save canvas" },
          { id: "cancel", label: "Cancel" },
        ];

  if (disabled) {
    return (
      <PickerShell question={question}>
        <div
          aria-disabled
          className="flex h-10 w-full min-w-0 cursor-not-allowed items-center justify-between rounded-md border border-input bg-card px-3 py-2 text-sm opacity-60"
        >
          <span className="truncate">{answeredLabel ?? "(no answer)"}</span>
        </div>
      </PickerShell>
    );
  }

  return (
    <PickerShell question={question}>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isSave = opt.id === "save";
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() =>
                onRespond(piece, { selected: [opt.id], text: opt.label })
              }
              className={
                isSave
                  ? "rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  : "rounded-md border border-input bg-card px-3 py-2 text-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </PickerShell>
  );
}

/**
 * Multi-select checklist for bulk removals. The server proposes every
 * delete target; the user toggles which ones to apply, then confirms once.
 */
function ConfirmBulkRemovalPiece({
  piece,
  onRespond,
  disabled,
  answeredLabel,
}: {
  piece: HumanInputPiece;
  onRespond: RespondHandler;
  disabled?: boolean | undefined;
  answeredLabel?: string | undefined;
}) {
  const question = piece.question ?? "Select which items to remove:";
  const options =
    piece.options.length > 0
      ? piece.options
      : [{ id: "none", label: "(no targets)" }];
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(options.map((opt) => opt.id)),
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedLabels = options
    .filter((opt) => selected.has(opt.id))
    .map((opt) => opt.label);

  if (disabled) {
    return (
      <PickerShell question={question}>
        <div
          aria-disabled
          className="flex h-10 w-full min-w-0 cursor-not-allowed items-center justify-between rounded-md border border-input bg-card px-3 py-2 text-sm opacity-60"
        >
          <span className="truncate">{answeredLabel ?? "(no answer)"}</span>
        </div>
      </PickerShell>
    );
  }

  return (
    <PickerShell question={question}>
      <ul className="flex flex-col gap-1.5">
        {options.map((opt) => {
          const checked = selected.has(opt.id);
          return (
            <li key={opt.id}>
              <button
                type="button"
                aria-pressed={checked}
                onClick={() => toggle(opt.id)}
                className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  checked
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-input bg-card hover:bg-muted"
                }`}
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded border text-[10px] font-semibold ${
                    checked
                      ? "border-destructive bg-destructive text-destructive-foreground"
                      : "border-input bg-background text-transparent"
                  }`}
                >
                  ✓
                </span>
                <span className="truncate">{opt.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={selected.size === 0}
          onClick={() =>
            onRespond(piece, {
              selected: Array.from(selected),
              text:
                selectedLabels.length > 0
                  ? `Remove: ${selectedLabels.join(", ")}`
                  : "Remove selected",
            })
          }
          className="rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {selected.size > 0
            ? `Remove selected (${selected.size})`
            : "Remove selected"}
        </button>
        <button
          type="button"
          onClick={() => onRespond(piece, { selected: [], text: "Keep all" })}
          className="rounded-md border border-input bg-card px-3 py-2 text-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Keep all
        </button>
      </div>
    </PickerShell>
  );
}

/**
 * Inline Yes/No confirmation rendered for the `confirm-removal` interrupt.
 * The server side `askConfirmRemoval` posts a choice request with two
 * options (`yes` / `no`); we just surface them as buttons and forward the
 * picked option through the same `onRespond` channel the pickers use.
 */
function ConfirmRemovalPiece({
  piece,
  onRespond,
  disabled,
  answeredLabel,
}: {
  piece: HumanInputPiece;
  onRespond: RespondHandler;
  disabled?: boolean | undefined;
  answeredLabel?: string | undefined;
}) {
  const question = piece.question ?? "Are you sure?";
  const options =
    piece.options.length > 0
      ? piece.options
      : [
          { id: "yes", label: "Yes" },
          { id: "no", label: "No" },
        ];

  if (disabled) {
    return (
      <PickerShell question={question}>
        <div
          aria-disabled
          className="flex h-10 w-full min-w-0 cursor-not-allowed items-center justify-between rounded-md border border-input bg-card px-3 py-2 text-sm opacity-60"
        >
          <span className="truncate">{answeredLabel ?? "(no answer)"}</span>
        </div>
      </PickerShell>
    );
  }

  return (
    <PickerShell question={question}>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isYes = opt.id === "yes";
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() =>
                onRespond(piece, { selected: [opt.id], text: opt.label })
              }
              className={
                isYes
                  ? "rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  : "rounded-md border border-input bg-card px-3 py-2 text-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </PickerShell>
  );
}

function PickerShell({
  question,
  children,
}: {
  question: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="flex max-w-[85%] flex-col gap-2">
      {question ? (
        <p className="text-sm leading-relaxed text-foreground">{question}</p>
      ) : null}
      {children}
    </div>
  );
}

/**
 * Read-only stand-in for a picker the user already answered. Mirrors the
 * AsyncSearchSelect trigger visually so the conversation feels continuous,
 * but skips the live combobox + server-action wiring entirely.
 */
function ResolvedPickerShell({
  question,
  label,
}: {
  question: string | undefined;
  label: string;
}) {
  return (
    <PickerShell question={question}>
      <div
        aria-disabled
        className="flex h-10 w-full min-w-0 cursor-not-allowed items-center justify-between rounded-md border border-input bg-card px-3 py-2 text-sm opacity-60"
      >
        <span className="truncate">{label}</span>
      </div>
    </PickerShell>
  );
}

/**
 * Renders the resolver-provided shortlist (when present) as a vertical
 * stack of buttons. One click sends the selection straight to the picker
 * response so the user doesn't have to re-type a query they already gave
 * us in chat.
 */
function CandidateShortlist({
  candidates,
  onPick,
  disabled,
}: {
  candidates: ResolverCandidate[];
  onPick: (id: string, label: string) => void;
  disabled?: boolean;
}) {
  if (candidates.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {candidates.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick(c.id, c.label)}
            className="flex w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-2 text-left text-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="truncate">{c.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function BriefPickerPiece({
  piece,
  onRespond,
}: {
  piece: HumanInputPiece;
  onRespond: RespondHandler;
}) {
  const [selected, setSelected] = useState<BriefPickerOption | null>(null);
  const candidates = readCandidates(piece);

  return (
    <PickerShell question={piece.question}>
      <CandidateShortlist
        candidates={candidates}
        onPick={(id, label) =>
          onRespond(piece, { selected: [id], text: label })
        }
      />
      <AsyncSearchSelect<BriefPickerOption>
        onSearch={searchBriefsForDiscoveryCanvas}
        value={selected}
        onChange={(value) => {
          setSelected(value);
          if (value) {
            onRespond(piece, { selected: [value.id], text: value.title });
          }
        }}
        renderItem={(brief) => (
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-sm">{brief.title}</span>
            {brief.companyName ? (
              <span className="text-xs text-muted-foreground shrink-0">
                {brief.companyName}
              </span>
            ) : null}
          </div>
        )}
        getItemValue={(brief) => brief.id}
        getItemLabel={(brief) => brief.title}
        placeholder={
          candidates.length > 0 ? "Or search another brief" : "Choose a brief"
        }
        searchPlaceholder="Search briefs..."
        emptyMessage="No briefs found."
        showClear={false}
      />
    </PickerShell>
  );
}

function AgentPickerPiece({
  piece,
  onRespond,
}: {
  piece: HumanInputPiece;
  onRespond: RespondHandler;
}) {
  const [selected, setSelected] = useState<AgentPickerOption | null>(null);
  const candidates = readCandidates(piece);

  return (
    <PickerShell question={piece.question}>
      <CandidateShortlist
        candidates={candidates}
        onPick={(id, label) =>
          onRespond(piece, { selected: [id], text: label })
        }
      />
      <AsyncSearchSelect<AgentPickerOption>
        onSearch={searchAgentsForDiscoveryCanvas}
        value={selected}
        onChange={(value) => {
          setSelected(value);
          if (value) {
            onRespond(piece, { selected: [value.id], text: value.title });
          }
        }}
        renderItem={(agent) => (
          <div className="flex w-full flex-col gap-0.5">
            <span className="text-sm">{agent.title}</span>
            {agent.description ? (
              <span className="line-clamp-1 text-xs text-muted-foreground">
                {agent.description}
              </span>
            ) : null}
          </div>
        )}
        getItemValue={(agent) => agent.id}
        getItemLabel={(agent) => agent.title}
        placeholder={
          candidates.length > 0 ? "Or search another agent" : "Choose an agent"
        }
        searchPlaceholder="Search agents..."
        emptyMessage="No agents found."
        showClear={false}
      />
    </PickerShell>
  );
}
