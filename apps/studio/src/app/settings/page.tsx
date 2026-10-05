import { studioSettings } from "@studio/settings";
import {
  BookOpen,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Database,
  ExternalLink,
  KeyRound,
  Palette,
  RadioTower,
  Server,
  ShieldCheck,
} from "lucide-react";
import { notFound, redirect } from "next/navigation";
import {
  DefinitionRow,
  SettingsCard,
} from "@/components/settings/settings-card";
import {
  SettingsNavigation,
  SettingsPanel,
} from "@/components/settings/settings-navigation";
import { StudioUpdates } from "@/components/studio-updates";
import { ThemePreferenceControl } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { getStudioShellContext } from "@/lib/studio-context";
import type {
  StudioConnectionStatus,
  StudioShellContext,
} from "@/lib/studio-context-model";
import { cn } from "@/lib/utils";

const connectionStyle: Record<
  StudioConnectionStatus,
  { dot: string; panel: string; icon: typeof CheckCircle2 }
> = {
  connected: {
    dot: "bg-emerald-500",
    panel: "border-emerald-500/20 bg-emerald-500/5",
    icon: CheckCircle2,
  },
  misconfigured: {
    dot: "bg-amber-500",
    panel: "border-amber-500/20 bg-amber-500/5",
    icon: CircleAlert,
  },
  unauthorized: {
    dot: "bg-destructive",
    panel: "border-destructive/20 bg-destructive/5",
    icon: CircleAlert,
  },
  unavailable: {
    dot: "bg-destructive",
    panel: "border-destructive/20 bg-destructive/5",
    icon: CircleAlert,
  },
};

function ScopeCard({ context }: { context: StudioShellContext }) {
  return (
    <SettingsCard
      icon={Database}
      title="Local scope"
      description="This preview observes one project scope authenticated by Studio’s server-only read key."
    >
      <dl>
        <DefinitionRow label="Scope" value={context.scope.label} />
        <DefinitionRow label="Project" value={context.scope.project} />
        <DefinitionRow
          label="Telemetry environments"
          value={
            context.scope.telemetryEnvironments.length ? (
              <span className="flex flex-wrap gap-1.5 sm:justify-end">
                {context.scope.telemetryEnvironments.map((environment) => (
                  <span
                    key={environment}
                    className="rounded-md border bg-background px-2 py-1 font-mono text-xs"
                  >
                    {environment}
                  </span>
                ))}
              </span>
            ) : (
              "Unavailable"
            )
          }
        />
      </dl>
    </SettingsCard>
  );
}

function ConnectionCard({ context }: { context: StudioShellContext }) {
  const style = connectionStyle[context.connection.status];
  const StatusIcon = style.icon;
  return (
    <SettingsCard
      icon={RadioTower}
      title="Connection"
      description="Current API reachability and the safe parts of this read-key context."
    >
      <div
        className={cn(
          "mb-4 flex items-start gap-3 rounded-lg border p-3",
          style.panel,
        )}
      >
        <StatusIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <span
              className={cn("size-2 rounded-full", style.dot)}
              aria-hidden="true"
            />
            {context.connection.label}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {context.connection.detail}
          </p>
        </div>
      </div>
      <dl>
        <DefinitionRow
          label="API service"
          value={
            context.connection.apiService
              ? `${context.connection.apiService} v${context.connection.apiVersion}`
              : "Unavailable"
          }
          mono
        />
        <DefinitionRow
          label="Key mode"
          value={
            context.connection.keyMode ? (
              <span className="uppercase">{context.connection.keyMode}</span>
            ) : (
              "Unavailable"
            )
          }
          mono
        />
        <DefinitionRow
          label="Scopes"
          value={
            context.connection.scopes.length
              ? context.connection.scopes.join(", ")
              : "Unavailable"
          }
          mono
        />
        <DefinitionRow
          label="KORTYX_API_URL"
          value={context.configuration.apiUrl}
        />
        <DefinitionRow
          label="KORTYX_STUDIO_API_KEY"
          value={context.configuration.studioApiKey}
          mono
        />
      </dl>
    </SettingsCard>
  );
}

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params?: Promise<{ section?: string }>;
  searchParams?: Promise<{ section?: string }>;
} = {}) {
  const [{ section }, query] = await Promise.all([
    params ?? Promise.resolve({ section: undefined }),
    searchParams ?? Promise.resolve({ section: undefined }),
  ]);
  if (!section && query.section && /^[a-z-]+$/.test(query.section))
    redirect(`/settings/${query.section}`);
  const context = await getStudioShellContext();
  const settings = await studioSettings.resolve(context);
  const available = [
    "privacy",
    "appearance",
    "about",
    ...(settings.categories?.map((c) => c.id) ?? []),
    ...(settings.scope !== null ? ["general"] : []),
    ...(settings.connection !== null ? ["connection"] : []),
    ...(settings.access !== null ? ["access"] : []),
    ...(settings.sections ? ["api-keys"] : []),
  ];
  if (section && !available.includes(section)) notFound();

  return (
    <div
      className="h-full overflow-hidden rounded-xl border bg-background shadow-sm"
      data-settings-ready="true"
    >
      <SettingsNavigation>
        {settings.scope !== null && (
          <SettingsPanel id="general" label="General">
            {settings.scope === undefined ? (
              <ScopeCard context={context} />
            ) : (
              settings.scope
            )}
          </SettingsPanel>
        )}
        {settings.connection !== null && (
          <SettingsPanel id="connection" label="Connection">
            {settings.connection === undefined ? (
              <ConnectionCard context={context} />
            ) : (
              settings.connection
            )}
          </SettingsPanel>
        )}
        {settings.access !== null && (
          <SettingsPanel id="access" label="Access">
            {settings.access === undefined ? (
              <SettingsCard
                icon={ShieldCheck}
                title="Access"
                description="Human access to this Studio instance is separate from its telemetry API key."
              >
                <dl>
                  <DefinitionRow
                    label="Studio mode"
                    value={context.identity.name}
                  />
                  <DefinitionRow
                    label="Authentication"
                    value={context.identity.access}
                  />
                </dl>
                <p className="mt-4 rounded-lg border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
                  HTTP Basic Auth is managed by the browser and reverse proxy.
                  Studio does not present a fake account or logout action. Clear
                  the browser’s site credentials to end a Basic Auth session.
                </p>
              </SettingsCard>
            ) : (
              settings.access
            )}
          </SettingsPanel>
        )}
        {settings.sections && (
          <SettingsPanel id="api-keys" label="API keys" group="Project">
            {settings.sections}
          </SettingsPanel>
        )}
        {settings.categories?.map((category) => (
          <SettingsPanel
            key={category.id}
            id={category.id}
            label={category.label}
            group={category.group ?? "Project"}
          >
            {category.content}
          </SettingsPanel>
        ))}
        <SettingsPanel id="privacy" label="Telemetry & privacy" group="Project">
          <SettingsCard
            icon={KeyRound}
            title="Telemetry & privacy"
            description="Payload capture is decided by the producing Kortyx SDK, not enabled from Studio."
          >
            <div className="space-y-3 text-sm leading-6">
              <div className="border-b pb-4">
                <p className="font-medium">Structural telemetry is available</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Run, span, workflow, timing, usage, and interrupt structure
                  can be observed without prompt or response content.
                </p>
              </div>
              <div className="pt-2">
                <p className="font-medium">Content is excluded by default</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Prompt and output content is captured only when the producer
                  explicitly opts in. Studio never turns content capture on.
                </p>
              </div>
            </div>
          </SettingsCard>
        </SettingsPanel>
        <SettingsPanel id="appearance" label="Appearance" group="Personal">
          <SettingsCard
            icon={Palette}
            title="Appearance"
            description="Theme changes persist in cookies and are applied by the server on the next load."
            className="xl:col-span-2"
          >
            <ThemePreferenceControl />
            <div className="mt-8 flex items-start gap-3 border-t pt-5">
              <Clock3
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-medium">UTC timestamps</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Studio renders telemetry timestamps and custom-range day
                  boundaries in UTC so shared investigations stay reproducible.
                </p>
              </div>
            </div>
          </SettingsCard>
        </SettingsPanel>
        <SettingsPanel id="about" label="About" group="Personal">
          {settings.updates === undefined ? (
            <StudioUpdates installedVersion={context.identity.version} />
          ) : (
            settings.updates
          )}
          <SettingsCard
            icon={Server}
            title="About"
            description="Build and source information for this Studio instance."
            className="xl:col-span-2"
          >
            <div className="space-y-5">
              <dl>
                <DefinitionRow
                  label="Studio version"
                  value={`v${context.identity.version}`}
                  mono
                />
                <DefinitionRow label="License" value="Elastic License 2.0" />
              </dl>
              <div>
                <Button variant="outline" asChild>
                  <a
                    href="https://kortyx.io/docs"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <BookOpen />
                    Documentation
                    <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              </div>
            </div>
          </SettingsCard>
        </SettingsPanel>
      </SettingsNavigation>
    </div>
  );
}
