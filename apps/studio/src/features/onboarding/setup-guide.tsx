import { BookOpen, RadioTower } from "lucide-react";
import Link from "@/components/scoped-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { StudioShellContext } from "@/lib/studio-context-model";
import { studioHelp } from "@/lib/studio-help";

/** Installation setup is real context, separate from sample-learning progress. */
export function StudioSetupGuide({ context }: { context: StudioShellContext }) {
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Connect your application</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Explore the sample whenever you like, then use these steps to verify
          your own integration.
        </p>
      </div>
      <Alert>
        <RadioTower aria-hidden="true" />
        <AlertTitle>Studio API: {context.connection.label}</AlertTitle>
        <AlertDescription>
          <p>{context.connection.detail}</p>
          <p>
            API connectivity does not prove that an application has published a
            workflow or sent execution telemetry.
          </p>
        </AlertDescription>
      </Alert>
      <ol className="flex list-decimal flex-col gap-5 pl-5 text-sm">
        <li>
          <h2 className="font-semibold">Connect the producer</h2>
          <p className="mt-1 text-muted-foreground">
            Configure the Studio telemetry adapter in your server-side Kortyx
            app. Keep producer credentials in the server environment.
          </p>
        </li>
        <li>
          <h2 className="font-semibold">Publish the workflow catalog</h2>
          <p className="mt-1 text-muted-foreground">
            Publish the workflow structure so Studio can relate execution
            evidence to the intended workflow. Follow the integration guide for
            your SDK version.
          </p>
        </li>
        <li>
          <h2 className="font-semibold">Verify a real request</h2>
          <p className="mt-1 text-muted-foreground">
            Send a request to your application, then inspect its run, session,
            and recorded events in your real project. Sample records and tour
            completion do not satisfy this step.
          </p>
        </li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <a
            href={studioHelp.connect.documentationUrl}
            target="_blank"
            rel="noreferrer"
          >
            <BookOpen data-icon="inline-start" />
            Integration documentation
          </a>
        </Button>
        <Button variant="secondary" asChild>
          <Link href="/runs">Open your runs</Link>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        The Explore menu and Help & tours menu remain available if you want to
        practice on read-only sample data first.
      </p>
    </section>
  );
}
