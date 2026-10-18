import { DetailPage } from "@/components/detail/detail-page";
import { DiagnosticDetails } from "@/features/diagnostics/diagnostic-details";
import { StudioDataError } from "@/features/telemetry/components/studio-data-error";
import { getStudioDiagnostic } from "@/lib/studio-api";

export default async function DiagnosticPage({
  params,
  searchParams,
}: {
  params: Promise<{ diagnosticId: string }>;
  searchParams: Promise<{ env?: string }>;
}) {
  const { diagnosticId } = await params;
  const { env } = await searchParams;
  if (!/^[a-f0-9-]{36}$/i.test(diagnosticId) || !env)
    return <p className="p-6">A diagnostic ID and environment are required.</p>;
  const result = await getStudioDiagnostic(diagnosticId, env);
  if (result.error)
    return (
      <StudioDataError title="Diagnostic unavailable" error={result.error} />
    );
  return (
    <DetailPage
      title="Error diagnostic"
      description="Inspect the exception, provider response, and capture details"
    >
      <DiagnosticDetails diagnostic={result.data} />
    </DetailPage>
  );
}
