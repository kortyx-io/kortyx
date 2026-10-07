import type { ApiPrincipal } from "../auth/contracts";
import type { EvalTarget, fetchEvalManifest } from "./targets";

/** Trusted server composition. Credentials stay internal, never in API responses.
 * Implementations must resolve targets from the verified request-local scope. */
export interface EvalTargetAdapter {
  list(principal: ApiPrincipal): Promise<readonly EvalTarget[]>;
  manifest(target: EvalTarget): ReturnType<typeof fetchEvalManifest>;
  cancel?(principal: ApiPrincipal, runId: string): Promise<void>;
}
