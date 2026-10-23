"use client";

import type { EvalJudgeIdentity } from "@kortyx/agent/evals";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useDetailDrawer } from "@/components/detail/detail-drawer";
import Link from "@/components/scoped-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PromptMessagePreview } from "@/features/prompts/components/prompt-message-preview";
import {
  judgeInstructionsDescription,
  type RecordedJudgeRequest,
} from "../lib/judge-instructions";
import { EvalDropdown } from "./eval-dropdown";

export function EvalJudgeInstructionsReader({
  judge,
  context,
  historical,
  backHref,
  recordedRequests = [],
  snapshotPending = false,
}: {
  judge?: EvalJudgeIdentity;
  context: string;
  historical: boolean;
  backHref: string;
  recordedRequests?: RecordedJudgeRequest[];
  snapshotPending?: boolean;
}) {
  const { presentation, navigation } = useDetailDrawer();
  const showHeader = presentation !== "drawer" || navigation?.expanded;
  const [search, setSearch] = useState("");
  const [requestKey, setRequestKey] = useState("");
  const recorded =
    recordedRequests.find((item) => item.key === requestKey) ??
    recordedRequests[0];
  const messages = judge?.prompt
    ? judge.prompt.content.messages
    : judge?.instructions
      ? [{ role: "system" as const, content: judge.instructions }]
      : (recorded?.request.messages ?? []);
  const showingRequest = Boolean(
    !judge?.prompt && !judge?.instructions && recorded,
  );
  const text = messages.map((message) => message.content).join("\n\n");
  const query = search.trim().toLocaleLowerCase();
  let matches = 0;
  if (query) {
    for (const message of messages) {
      const lower = message.content.toLocaleLowerCase();
      let next = lower.indexOf(query);
      while (next >= 0) {
        matches += 1;
        next = lower.indexOf(query, next + query.length);
      }
    }
  }
  return (
    <div data-judge-instructions className="flex h-full min-h-0 flex-col">
      <div
        data-judge-instructions-context
        className="flex shrink-0 flex-col gap-3 border-b p-4"
      >
        {showHeader ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" asChild>
              <Link
                href={backHref}
                aria-label="Back to conversation"
                onNavigate={(event) => {
                  if (!navigation) return;
                  event.preventDefault();
                  navigation.close();
                }}
              >
                <ArrowLeft />
              </Link>
            </Button>
            <h1 className="text-sm font-semibold">Judge instructions</h1>
          </div>
        ) : null}
        {showHeader ? (
          <p className="text-xs text-muted-foreground">{context}</p>
        ) : null}
        {judge ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="break-all font-mono text-xs">
              {judge.prompt
                ? `${judge.prompt.id} · v${judge.prompt.version}`
                : `${judge.id} · ${judge.version}`}
            </span>
            <Badge variant="secondary">
              {historical
                ? text
                  ? showingRequest
                    ? "Recorded grading request"
                    : "Saved snapshot"
                  : "Saved judge"
                : "Configured instructions"}
            </Badge>
          </div>
        ) : null}
        {!judge && showingRequest ? (
          <Badge variant="secondary" className="self-start">
            Recorded grading request
          </Badge>
        ) : null}
        {judge?.prompt ? (
          <p className="break-all text-xs text-muted-foreground">
            Judge:{" "}
            <span className="font-mono">
              {judge.id} · {judge.version}
            </span>
          </p>
        ) : null}
        <p className="text-xs leading-relaxed text-muted-foreground">
          {showingRequest
            ? `${snapshotPending ? "The final judge snapshot is not yet available." : "The judge snapshot is unavailable."} These are the exact messages saved for this grading call, including its criterion and evidence.`
            : judgeInstructionsDescription(historical)}
        </p>
        {showingRequest && recorded ? (
          <div className="space-y-2">
            {recordedRequests.length > 1 ? (
              <EvalDropdown
                label="Recorded grading request"
                value={recorded.key}
                options={recordedRequests.map((item) => ({
                  value: item.key,
                  label: `${item.caseId} · Attempt ${item.repetition} · Step ${item.stepIndex + 1} · Criterion ${item.criterionId}`,
                  description: item.criterion,
                }))}
                onChange={setRequestKey}
                className="w-full"
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                {recorded.caseId} · Attempt {recorded.repetition} · Step{" "}
                {recorded.stepIndex + 1} · Criterion {recorded.criterionId}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {recorded.criterion}
            </p>
            <p className="break-all font-mono text-xs text-muted-foreground">
              {recorded.request.protocol}
              {recorded.request.prompt
                ? ` · ${recorded.request.prompt.id} · v${recorded.request.prompt.version}`
                : ""}
            </p>
          </div>
        ) : null}
        {text ? (
          <div className="flex items-center gap-2">
            <Input
              type="search"
              aria-label="Find in judge instructions"
              placeholder="Find in instructions…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-w-0 flex-1"
            />
          </div>
        ) : null}
        {query ? (
          <output className="text-xs text-muted-foreground">
            {matches} {matches === 1 ? "match" : "matches"}
          </output>
        ) : null}
      </div>
      <div className="data-table-body-scroll min-h-0 flex-1 overflow-y-auto p-5">
        {text ? (
          <article
            aria-label="Judge instruction text"
            className="mx-auto min-w-0 max-w-3xl space-y-6"
          >
            {messages.map((message, index) => (
              <PromptMessagePreview
                key={`${index}:${message.role}`}
                label={`${message.role[0]?.toUpperCase()}${message.role.slice(1)} Message${showingRequest || judge?.prompt?.content.format === "chat" ? ` ${index + 1}` : ""}`}
                value={message.content}
                search={search}
              />
            ))}
          </article>
        ) : (
          <p className="text-sm text-muted-foreground">
            {historical
              ? snapshotPending
                ? "Judge snapshot is not yet available. No grading requests have been recorded yet."
                : "Instructions not recorded."
              : "Instructions are not published by the configured judge."}
          </p>
        )}
      </div>
    </div>
  );
}
