import { readEvaluatorLibrary } from "@/features/evaluators/api/server";
import { EvaluatorLibraryView } from "@/features/evaluators/components/evaluator-library";
import { StudioDataError } from "@/features/telemetry/components/studio-data-error";
export default async function Page() {
  const result = await readEvaluatorLibrary();
  if (result.error)
    return (
      <StudioDataError title="Unable to load evaluators" error={result.error} />
    );
  return <EvaluatorLibraryView library={result.data} />;
}
