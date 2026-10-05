import type { StudioEvalTargets } from "@kortyx/agent/evals";
import { StudioReadError } from "./read-client";

export type EvalDoctorCheck = {
  id: string;
  status: "passed" | "failed" | "skipped";
  message: string;
  remedy?: string;
  code?: string;
};
export type EvalDoctorReport = {
  schemaVersion: 1;
  status: "passed" | "failed";
  checks: EvalDoctorCheck[];
};

type Diagnostic = NonNullable<
  StudioEvalTargets["targets"][number]["diagnostic"]
>;
const advice: Record<Diagnostic["code"], { message: string; remedy: string }> =
  {
    environment_forbidden: {
      message: "Target environment is not allowed in this Studio project.",
      remedy:
        "Allow the target environment in the project, or correct the target's environment label.",
    },
    environment_unavailable: {
      message: "Studio could not check the target environment.",
      remedy:
        "Inspect Studio API database connectivity and private server logs.",
    },
    endpoint_not_found: {
      message: "Application endpoint returned HTTP 404.",
      remedy:
        "Ensure the eval route is mounted and enabled in the deployed application; check the target URL and reverse proxy route.",
    },
    endpoint_unauthorized: {
      message: "Application endpoint rejected discovery credentials.",
      remedy:
        "Match the consumer handler service key to the Studio target. If the app authenticates a test actor during discovery, also check that actor's credentials and permissions.",
    },
    endpoint_http_error: {
      message: "Application endpoint returned an unsuccessful HTTP status.",
      remedy:
        "Inspect the consumer and proxy logs. Check deployment configuration and any app-owned test-identity initialization.",
    },
    endpoint_unreachable: {
      message: "Studio API could not fetch the application manifest.",
      remedy:
        "Check API-to-consumer networking, DNS, TLS and timeouts. From Docker Desktop use host.docker.internal for a host app; redirects are not followed.",
    },
    manifest_invalid: {
      message:
        "Application returned an empty, oversized or incompatible manifest.",
      remedy:
        "Mount createEvalRouteHandler on the exact target URL and use compatible SDK/Studio releases. Check whether a proxy returned HTML instead of JSON.",
    },
  };

export function buildEvalDoctorReport(
  data: StudioEvalTargets,
  options: {
    target?: string;
    environment?: string | undefined;
    judge: "studio" | "app";
    suite?: string;
  },
): EvalDoctorReport {
  const checks: EvalDoctorCheck[] = [
    {
      id: "studio_access",
      status: "passed",
      message: "Authenticated Studio discovery (studio:read).",
    },
    {
      id: "execution_permission",
      status: data.canRun ? "passed" : "failed",
      message: data.canRun
        ? "Studio key has eval:run."
        : "Studio key lacks eval:run.",
      ...(!data.canRun
        ? {
            remedy:
              "Grant eval:run to this project key. For local bootstrap rerun with KORTYX_STUDIO_ENABLE_EVALS=1 and the existing stored key.",
          }
        : {}),
    },
  ];
  const targets = data.targets.filter(
    (target) =>
      (!options.target || target.id === options.target) &&
      (!options.environment || target.environment === options.environment),
  );
  checks.push({
    id: "target_selection",
    status: targets.length ? "passed" : "failed",
    message: targets.length
      ? `${targets.length} matching application target(s).`
      : "No application target matches this connection and selection.",
    ...(!targets.length
      ? {
          remedy:
            "Register the target with this key's organization/project and environment. Mount KORTYX_EVAL_TARGETS_FILE on the Studio API, restart it, and check --target/--environment and the connection's default environment.",
        }
      : {}),
  });
  for (const target of targets) {
    const prefix = `${target.id} (${target.environment})`;
    const diagnostic = target.diagnostic;
    const environmentFailed =
      diagnostic?.code === "environment_forbidden" ||
      diagnostic?.code === "environment_unavailable";
    checks.push({
      id: `${target.id}:environment`,
      status: environmentFailed
        ? "failed"
        : target.manifest || diagnostic
          ? "passed"
          : "skipped",
      message: `${prefix}: ${environmentFailed ? advice[diagnostic.code].message : target.manifest || diagnostic ? "target environment allowed." : "environment check unavailable on this API."}`,
      ...(environmentFailed ? { remedy: advice[diagnostic.code].remedy } : {}),
    });
    if (!target.manifest) {
      const guidance =
        diagnostic && !environmentFailed ? advice[diagnostic.code] : undefined;
      checks.push({
        id: `${target.id}:manifest`,
        status: environmentFailed ? "skipped" : "failed",
        ...(diagnostic ? { code: diagnostic.code } : {}),
        message: `${prefix}: ${environmentFailed ? "discovery skipped because the environment check failed." : (guidance?.message ?? "consumer unavailable; this API did not supply a failure category.")}${diagnostic?.httpStatus ? ` (HTTP ${diagnostic.httpStatus})` : ""}`,
        ...(!environmentFailed
          ? {
              remedy:
                guidance?.remedy ??
                "Check the deployed consumer route, matching service key and API-to-consumer reachability. Upgrade the Studio API for detailed discovery diagnostics.",
            }
          : {}),
      });
      checks.push({
        id: `${target.id}:judge`,
        status: "skipped",
        message: `${prefix}: judge compatibility cannot be checked without a manifest.`,
      });
      continue;
    }
    const suites = target.manifest.suites;
    const selectedSuite = options.suite
      ? suites.find((suite) => suite.id === options.suite)
      : undefined;
    const suitesReady = options.suite
      ? Boolean(selectedSuite)
      : suites.length > 0;
    checks.push({
      id: `${target.id}:manifest`,
      status: suitesReady ? "passed" : "failed",
      message: `${prefix}: authenticated manifest valid; ${suites.length} registered suite(s).${options.suite ? ` Requested suite ${options.suite} ${selectedSuite ? "found" : "missing"}.` : ""}`,
      ...(!suitesReady
        ? {
            remedy:
              "Pass the intended suite to createEvals({ suites: [...] }), deploy the application and refresh discovery. Suites are fetched from the consumer; topology publication does not register them.",
          }
        : {}),
    });
    const judgeReady =
      options.judge === "studio"
        ? Boolean(data.studioJudge && target.manifest.studioJudging)
        : Boolean(target.manifest.judge);
    checks.push({
      id: `${target.id}:judge`,
      status: judgeReady ? "passed" : "failed",
      message: `${prefix}: ${options.judge} judge ${judgeReady ? "configured and advertised" : "unavailable"}.`,
      ...(!judgeReady
        ? {
            remedy:
              options.judge === "app"
                ? "Provide a code judge to createEvals in the consumer, or explicitly select --judge studio."
                : !data.studioJudge
                  ? "Configure KORTYX_EVAL_JUDGE_MODEL and KORTYX_EVAL_JUDGE_API_KEY on the Studio API and restart it, or explicitly select an available --judge app."
                  : "Update the consumer SDK to advertise Studio judging support, or select an available --judge app.",
          }
        : {}),
    });
  }
  return {
    schemaVersion: 1,
    status: checks.some((check) => check.status === "failed")
      ? "failed"
      : "passed",
    checks,
  };
}

export function evalDoctorFailure(error: unknown): EvalDoctorReport {
  const safe = error instanceof StudioReadError ? error : null;
  const connectionError =
    safe &&
    [
      "invalid_config",
      "invalid_connection",
      "not_configured",
      "unknown_connection",
      "invalid_key_env",
      "missing_key",
      "invalid_key",
      "invalid_url",
      "incompatible_studio_api",
      "schema_mismatch",
      "connection_failed",
    ].includes(safe.code);
  return {
    schemaVersion: 1,
    status: "failed",
    checks: [
      {
        id: "studio_access",
        status: "failed",
        ...(safe ? { code: safe.code } : {}),
        message: connectionError
          ? safe.message
          : safe?.status === 401
            ? "Studio rejected the project key (HTTP 401)."
            : safe?.status === 403
              ? "Studio discovery requires studio:read (HTTP 403)."
              : safe?.status === 404
                ? "Studio eval discovery endpoint was not found (HTTP 404)."
                : "Could not resolve the Studio connection or read a compatible discovery response.",
        remedy:
          "Check the selected connection, its API URL and project key, network access, and compatible CLI/Studio releases. No consumer or provider credentials belong in this CLI connection.",
      },
    ],
  };
}

export function formatEvalDoctorReport(report: EvalDoctorReport): string {
  const symbols = { passed: "✓", failed: "✗", skipped: "–" };
  return [
    "Kortyx Evals · Setup check",
    ...report.checks.flatMap((check) => [
      `  ${symbols[check.status]} ${check.message}`,
      ...(check.remedy ? [`    → ${check.remedy}`] : []),
    ]),
    "",
    report.status === "passed"
      ? "Configuration checks passed. Run one representative suite to verify the test identity, tools, model access and saved results."
      : "Setup checks failed. Resolve the failures and run doctor again.",
    "No workflow or judge calls were started. Consumer GET discovery may run app-owned authentication logic.",
  ]
    .join("\n")
    .replace(/\p{Cc}/gu, (character) => (character === "\n" ? character : ""));
}
