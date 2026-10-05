"use client";

import { Rocket } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { SettingsCard } from "@/components/settings/settings-card";
import { Button } from "@/components/ui/button";

export interface StudioSetupStep {
  title: string;
  content: ReactNode;
  canContinue?: boolean;
}

/** In-app setup, shared by self-hosted and selected server adapters. */
export function StudioSetupFlow({
  steps,
  finish,
  completionCookie,
}: {
  steps: readonly StudioSetupStep[];
  finish?: ReactNode;
  /** Non-sensitive self-hosted UI preference, never an authentication cookie. */
  completionCookie?: string;
}) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  if (!step) return null;
  return (
    <SettingsCard
      icon={Rocket}
      title="Get started with Studio"
      description="Connect your application, then start observing."
      className="xl:col-span-2"
    >
      <ol className="mb-5 flex flex-wrap gap-3" aria-label="Setup progress">
        {steps.map((item, position) => (
          <li
            key={item.title}
            aria-current={position === index ? "step" : undefined}
            className={
              position === index
                ? "text-sm font-medium"
                : "text-sm text-muted-foreground"
            }
          >
            {position + 1}. {item.title}
          </li>
        ))}
      </ol>
      <h3 className="mb-3 text-base font-medium">{step.title}</h3>
      <div className="space-y-4">{step.content}</div>
      <div className="mt-5 flex flex-wrap gap-2">
        {index > 0 && (
          <Button variant="outline" onClick={() => setIndex(index - 1)}>
            Back
          </Button>
        )}
        {index < steps.length - 1 ? (
          <Button
            disabled={step.canContinue === false}
            onClick={() => setIndex(index + 1)}
          >
            Continue
          </Button>
        ) : finish !== undefined ? (
          finish
        ) : (
          <Button asChild>
            <Link
              href="/runs"
              onClick={() => {
                if (completionCookie)
                  // biome-ignore lint/suspicious/noDocumentCookie: Non-sensitive UI preference; auth is independently server-enforced.
                  document.cookie = `${completionCookie}=1; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
              }}
            >
              Start observing
            </Link>
          </Button>
        )}
      </div>
    </SettingsCard>
  );
}
