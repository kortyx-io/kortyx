import "server-only";
import { createSampleProjectReadModels } from "@kortyx/telemetry-db/sample-project";
import { createSampleEvaluations } from "./evaluations";
import { createSamplePrompts } from "./prompts";

// Private module state: responses are cloned before crossing a request boundary.
let dataset: ReturnType<typeof build> | undefined;
function build() {
  const models = createSampleProjectReadModels();
  const prompts = createSamplePrompts();
  return {
    ...models,
    prompts,
    evals: createSampleEvaluations(models, prompts),
  };
}
export function readSampleDataset() {
  dataset ??= build();
  return structuredClone(dataset);
}
