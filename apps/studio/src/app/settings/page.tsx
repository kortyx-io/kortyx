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
import type { ReactNode } from "react";
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

function SettingsCard({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: typeof Server;
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-xl border bg-card/30 p-5 shadow-xs",
        className,
      )}
    >
      <div className="mb-5 flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background">
          <Icon className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

function DefinitionRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1 border-b py-3 first:pt-0 last:border-b-0 last:pb-0 sm:grid-cols-[minmax(8rem,0.6fr)_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 break-words text-sm sm:text-right",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

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

export default async function SettingsPage() {
  const context = await getStudioShellContext();

  return (
    <div
      className="h-full overflow-y-auto rounded-xl border bg-background"
      data-settings-ready="true"
    >
      <header className="border-b px-5 py-5 sm:px-7 sm:py-6">
        <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Local configuration
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Understand this Studio instance, its telemetry connection, and the
          display preferences that apply in this browser.
        </p>
      </header>

      <div className="grid gap-4 p-4 sm:p-6 xl:grid-cols-2">
        <ScopeCard context={context} />
        <ConnectionCard context={context} />

        <SettingsCard
          icon={ShieldCheck}
          title="Access"
          description="Human access to this Studio instance is separate from its telemetry API key."
        >
          <dl>
            <DefinitionRow label="Studio mode" value={context.identity.name} />
            <DefinitionRow
              label="Authentication"
              value={context.identity.access}
            />
          </dl>
          <p className="mt-4 rounded-lg border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
            HTTP Basic Auth is managed by the browser and reverse proxy. Studio
            does not present a fake account or logout action. Clear the
            browser’s site credentials to end a Basic Auth session.
          </p>
        </SettingsCard>

        <SettingsCard
          icon={KeyRound}
          title="Telemetry & privacy"
          description="Payload capture is decided by the producing Kortyx SDK, not enabled from Studio."
        >
          <div className="space-y-3 text-sm leading-6">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="font-medium">Structural telemetry is available</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Run, span, workflow, timing, usage, and interrupt structure can
                be observed without prompt or response content.
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="font-medium">Content is excluded by default</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Prompt and output content is captured only when the producer
                explicitly opts in. Studio never turns content capture on.
              </p>
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          icon={Palette}
          title="Appearance"
          description="Theme changes persist in cookies and are applied by the server on the next load."
          className="xl:col-span-2"
        >
          <ThemePreferenceControl />
          <div className="mt-5 flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
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

        <SettingsCard
          icon={Server}
          title="About"
          description="Build and source information for this Studio instance."
          className="xl:col-span-2"
        >
          <div className="grid items-end gap-4 md:grid-cols-[1fr_auto]">
            <dl>
              <DefinitionRow
                label="Studio version"
                value={`v${context.identity.version}`}
                mono
              />
              <DefinitionRow label="License" value="Elastic License 2.0" />
            </dl>
            <Button variant="outline" asChild>
              <a href="https://kortyx.io/docs" target="_blank" rel="noreferrer">
                <BookOpen />
                Documentation
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}
