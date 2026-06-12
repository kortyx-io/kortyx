import "server-only";

import { useStructuredData } from "kortyx";
import { RESOLVED_ENTITY_DATA_TYPE } from "@/lib/protocol";

type ResolvedEntityKind = "brief" | "agent";

/**
 * Notifies the client which brief/agent is in focus so it can stash the id
 * alongside picker-driven flows. Without this, auto-resolved single hits
 * (e.g. "describe the support triage brief") wouldn't update `resolvedIds` and
 * the next chat turn would lose context.
 */
export function emitResolvedEntity(args: {
  kind: ResolvedEntityKind;
  id: string;
  label: string;
  streamId?: string;
}): void {
  useStructuredData({
    id: `resolved-${args.kind}`,
    streamId: args.streamId ?? `resolved-entity-${args.kind}`,
    dataType: RESOLVED_ENTITY_DATA_TYPE,
    data: {
      kind: args.kind,
      id: args.id,
      label: args.label,
    },
  });
}
