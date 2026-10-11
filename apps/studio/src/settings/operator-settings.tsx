import { FlaskConical, KeyRound } from "lucide-react";
import { SettingsCard } from "@/components/settings/settings-card";

export function OperatorKeySettings() {
  return (
    <SettingsCard
      icon={KeyRound}
      title="API keys"
      description="This installation’s credentials are managed by its operator, not by a hosted account service."
    >
      <p className="text-sm leading-6 text-muted-foreground">
        Print your SDK connection variables from the installation’s terminal.
        Never paste the Studio read key into your application or browser.
      </p>
      <pre className="mt-4 overflow-x-auto rounded-md bg-muted p-3 text-xs">
        npx kortyx studio credentials --format dotenv --service-name my-agent
      </pre>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        The command uses the installation’s saved credentials. Studio does not
        display stored secrets or manage team accounts.
      </p>
    </SettingsCard>
  );
}

export function OperatorEvaluationSettings() {
  return (
    <SettingsCard
      icon={FlaskConical}
      title="Evaluation configuration"
      description="Application endpoints and judge credentials are server-owned configuration."
    >
      <h3 className="text-sm font-medium">Application endpoints</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Register targets with KORTYX_EVAL_TARGETS or KORTYX_EVAL_TARGETS_FILE on
        the API server. Each target has an ID, name, organization/project scope,
        environment, HTTPS URL and server-only service key. Credentials and URLs
        are not exposed to the browser.
      </p>
      <h3 className="mt-5 text-sm font-medium">
        Evaluation judge provider & model
      </h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Configure KORTYX_EVAL_JUDGE_MODEL, KORTYX_EVAL_JUDGE_API_KEY, and
        optionally KORTYX_EVAL_JUDGE_BASE_URL on the API server. Never put
        provider credentials in public environment variables.
      </p>
      <a
        href="https://kortyx.io/docs"
        className="mt-4 inline-block text-sm underline"
        target="_blank"
        rel="noreferrer"
      >
        Evaluation documentation
      </a>
    </SettingsCard>
  );
}
