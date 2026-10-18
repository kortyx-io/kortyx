import "server-only";
import { createSampleProjectReadModels } from "@kortyx/telemetry-db/sample-project";
import { createSampleEvaluations } from "./evaluations";
import { createSamplePrompts } from "./prompts";

// Private module state: responses are cloned before crossing a request boundary.
let dataset: ReturnType<typeof build> | undefined;
function build() {
  const models = createSampleProjectReadModels();
  const prompts = createSamplePrompts();
  const evals = createSampleEvaluations(models, prompts);
  return {
    ...models,
    prompts,
    evals,
    diagnostics: [...models.diagnostics, ...evals.diagnostics],
  };
}
export function readSampleDataset() {
  dataset ??= build();
  return structuredClone(dataset);
}
