// biome-ignore-all lint/correctness/useHookAtTopLevel: Kortyx interrupt APIs are hook-shaped but execute in workflow nodes, not React components.
import "server-only";

import { useInterrupt } from "kortyx";
import { CONFIRM_REMOVAL_INTERRUPT_ID } from "@/lib/protocol";
import {
  confirmBulkRemovalRequestSchema,
  confirmBulkRemovalResponseSchema,
  confirmRemovalRequestSchema,
} from "@/schemas/interrupts";

export type RemovalConfirmTarget = {
  /** Stable interrupt option id — mapped back server-side after resume. */
  id: string;
  /** User-facing label shown in the interrupt UI. */
  label: string;
};

/**
 * Yes/No interrupt used by the remove-* branches of the update-canvas
 * workflow when exactly one target is proposed.
 */
export async function askConfirmRemoval(args: {
  id: string;
  question: string;
}): Promise<boolean> {
  const response = await useInterrupt({
    id: args.id,
    request: {
      kind: "choice",
      question: args.question,
      options: [
        { id: "yes", label: "Yes, remove it" },
        { id: "no", label: "Keep it" },
      ],
    },
    requestSchema: confirmRemovalRequestSchema,
    schemaId: CONFIRM_REMOVAL_INTERRUPT_ID,
    schemaVersion: "1",
  });

  const picked = Array.isArray(response) ? response[0] : response;
  return picked === "yes";
}

/**
 * Confirms one or more proposed removals.
 *
 * - 0 targets → `[]` (caller should skip)
 * - 1 target  → classic yes/no
 * - 2+ targets → multi-choice listing every proposed delete
 */
export async function askConfirmRemovals(args: {
  id: string;
  question: string;
  targets: RemovalConfirmTarget[];
}): Promise<string[]> {
  if (args.targets.length === 0) return [];

  if (args.targets.length === 1) {
    const target = args.targets[0];
    if (!target) return [];
    const approved = await askConfirmRemoval({
      id: args.id,
      question: args.question,
    });
    return approved ? [target.id] : [];
  }

  const response = await useInterrupt({
    id: args.id,
    request: {
      kind: "multi-choice",
      multiple: true,
      question: args.question,
      options: args.targets.map((target) => ({
        id: target.id,
        label: target.label,
      })),
    },
    requestSchema: confirmBulkRemovalRequestSchema,
    responseSchema: confirmBulkRemovalResponseSchema,
    schemaId: CONFIRM_REMOVAL_INTERRUPT_ID,
    schemaVersion: "2",
  });

  return Array.isArray(response) ? response.map(String) : [];
}
