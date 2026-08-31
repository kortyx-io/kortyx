"use client";

import { Check, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { FlowLine } from "./flow-line";

type CodeTab = "workflow" | "reason" | "react";

const codeByTab: Record<CodeTab, Array<[string, string]>> = {
  workflow: [
    ["muted", "// refund-review.workflow.ts"],
    ["purple", "export const refundReview = defineWorkflow({"],
    ["text", '  id: "refund-review",'],
    ["text", "  nodes: {"],
    ["blue", "    findOrder, checkPolicy, draftDecision,"],
    ["blue", "    approveRefund, issueRefund,"],
    ["text", "  },"],
    ["text", "  edges: ["],
    ["green", '    ["findOrder", "checkPolicy"],'],
    ["green", '    ["checkPolicy", "draftDecision"],'],
    ["green", '    ["draftDecision", "approveRefund"],'],
    ["green", '    ["approveRefund", "issueRefund"],'],
    ["text", "  ],"],
    ["purple", "});"],
  ],
  reason: [
    ["muted", "// draft-decision.node.ts"],
    ["purple", "const result = await useReason<RefundDecision>({"],
    ["text", '  id: "draft-decision",'],
    ["text", '  model: google("gemini-2.5-flash"),'],
    ["text", "  input: orderAndPolicy,"],
    ["blue", "  outputSchema: refundDecisionSchema,"],
    ["blue", "  stream: true, emit: true,"],
    ["text", "  structured: {"],
    ["green", '    dataType: "refund.decision",'],
    ["green", "    fields: {"],
    ["green", '      summary: "text-delta",'],
    ["green", '      recommendation: "set",'],
    ["green", "    },"],
    ["text", "  },"],
    ["purple", "});"],
  ],
  react: [
    ["muted", "// refund-review.tsx"],
    ["purple", "const chat = useChat({ transport });"],
    ["text", "const review = readRefundDecision("],
    ["blue", "  chat.streamContentPieces,"],
    ["text", ");"],
    ["text", ""],
    ["purple", "return <RefundReview"],
    ["green", "  decision={review}"],
    ["green", "  isStreaming={chat.isStreaming}"],
    ["green", "  onReview={(piece, action) =>"],
    ["blue", "    chat.respondToInterrupt(piece, {"],
    ["blue", "      selected: [action],"],
    ["blue", "    })"],
    ["green", "  }"],
    ["purple", "/>;"],
  ],
};

const tabLabels: Array<{ id: CodeTab; label: string }> = [
  { id: "workflow", label: "workflow.ts" },
  { id: "reason", label: "reason.ts" },
  { id: "react", label: "react.tsx" },
];

const refundFacts = [
  {
    title: "Policy check",
    text: "Within 30 days · unopened",
  },
  {
    title: "Recommendation",
    text: "Refund $84.00 to original card",
  },
];

export function AgentRuntimeDemo() {
  const [codeTab, setCodeTab] = useState<CodeTab>("reason");
  const [isResumed, setIsResumed] = useState(false);

  return (
    <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-[#0d0d13] shadow-[0_32px_120px_rgba(0,0,0,0.55)]">
      <div className="flex items-center justify-between border-b border-white/8 bg-white/[0.025] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.08em] text-white/35 uppercase">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-40" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
          </span>
          Runtime connected
        </div>
      </div>

      <div className="grid min-h-[500px] lg:grid-cols-[0.98fr_1.02fr]">
        <div className="border-b border-white/8 lg:border-r lg:border-b-0">
          <div
            role="tablist"
            aria-label="Kortyx code examples"
            className="flex overflow-x-auto border-b border-white/8 bg-[#09090e] px-2"
          >
            {tabLabels.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={codeTab === tab.id}
                onClick={() => setCodeTab(tab.id)}
                className={cn(
                  "relative shrink-0 px-3 py-3 font-mono text-[10px] transition-colors",
                  codeTab === tab.id
                    ? "text-white"
                    : "text-white/35 hover:text-white/65",
                )}
              >
                {tab.label}
                {codeTab === tab.id ? (
                  <span className="absolute inset-x-3 bottom-0 h-px bg-[#8b7cff] shadow-[0_0_12px_#8b7cff]" />
                ) : null}
              </button>
            ))}
          </div>

          <div
            key={codeTab}
            role="tabpanel"
            className="marketing-code-enter min-h-[330px] overflow-x-auto p-5 font-mono text-[11px] leading-6 sm:p-6 sm:text-xs"
          >
            {codeByTab[codeTab].map(([tone, line], index) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: Code lines are static and never reordered.
                key={index}
                className={cn(
                  "min-h-6 whitespace-pre",
                  tone === "muted" && "text-white/28",
                  tone === "text" && "text-[#d7d6e0]",
                  tone === "purple" && "text-[#b8a7ff]",
                  tone === "blue" && "text-[#7dd3fc]",
                  tone === "green" && "text-[#78dba9]",
                )}
              >
                {line || " "}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 border-t border-white/8 px-5 py-3 font-mono text-[10px] text-white/32">
            <Play className="size-3.5 text-[#8b7cff]" />
            Schema-validated state · streamed to React
          </div>
        </div>

        <div className="relative bg-[radial-gradient(circle_at_50%_0%,rgba(109,88,255,0.12),transparent_48%)] p-4 sm:p-5">
          <div className="mx-auto max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#111119]/95 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
              <div>
                <p className="text-xs font-medium text-white">
                  Refund request #4831
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-white/32">
                  Maya Lopez · wireless keyboard
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full border px-2 py-1 font-mono text-[10px]",
                  isResumed
                    ? "border-emerald-400/25 bg-emerald-400/8 text-emerald-300"
                    : "border-amber-400/25 bg-amber-400/8 text-amber-200",
                )}
              >
                {isResumed ? "refunded" : "approval needed"}
              </span>
            </div>

            <div className="grid grid-cols-4 border-b border-white/8 px-4 py-3">
              {["Order", "Policy", "Draft", "Approve"].map((label, index) => {
                const isComplete = index < 3 || isResumed;
                const isActive = index === 3 && !isResumed;
                return (
                  <div key={label} className="relative flex flex-col gap-2">
                    {index < 3 ? (
                      <FlowLine className="absolute top-0 left-[6px] h-3 w-full" />
                    ) : null}
                    <span
                      className={cn(
                        "relative z-10 grid size-3 place-items-center rounded-full border",
                        isComplete && "border-[#8b7cff] bg-[#8b7cff]",
                        isActive &&
                          "border-amber-300 bg-amber-300 shadow-[0_0_0_4px_rgba(252,211,77,0.08)]",
                      )}
                    >
                      {isComplete ? (
                        <Check className="size-2 text-white" strokeWidth={3} />
                      ) : null}
                    </span>
                    <span className="font-mono text-[10px] text-white/60">
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="space-y-3 p-4">
              <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                <div className="flex items-center gap-2 text-[10px] text-white/42">
                  <Sparkles className="size-3.5 text-[#9f8fff]" />
                  Agent checked the order and refund policy
                </div>
                <p className="mt-2 text-sm font-medium text-white/82">
                  Customer received the wrong keyboard layout and requested a
                  refund.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {refundFacts.map((section) => (
                    <div
                      key={section.title}
                      className="rounded-lg border border-white/7 bg-black/20 p-2.5"
                    >
                      <p className="font-mono text-[10px] tracking-[0.08em] text-[#a99cff] uppercase">
                        {section.title}
                      </p>
                      <p className="mt-1.5 text-[10px] leading-4 text-white/45">
                        {section.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {!isResumed ? (
                <div className="marketing-state-enter rounded-xl border border-amber-300/20 bg-amber-300/[0.045] p-3 shadow-[0_0_32px_rgba(252,211,77,0.035)]">
                  <div className="flex items-start gap-2.5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-amber-300/10 text-amber-200">
                      <Pause className="size-3.5" />
                    </span>
                    <div>
                      <p className="text-xs font-medium text-white">
                        Issue the $84.00 refund?
                      </p>
                      <p className="mt-1 text-[10px] leading-4 text-white/38">
                        Execution is checkpointed. The same run resumes after
                        the user decides.
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsResumed(true)}
                      className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-white px-3 text-[10px] font-semibold text-[#0a0a0f] transition-transform hover:-translate-y-0.5"
                    >
                      <Play className="size-3" fill="currentColor" />
                      Approve & resume
                    </button>
                    <button
                      type="button"
                      className="h-9 rounded-lg border border-white/10 px-3 text-[10px] text-white/55 hover:bg-white/5 hover:text-white"
                    >
                      Escalate
                    </button>
                  </div>
                </div>
              ) : (
                <div className="marketing-state-enter rounded-xl border border-emerald-300/20 bg-emerald-300/[0.045] p-3">
                  <div className="flex items-start gap-2.5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-emerald-300/10 text-emerald-200">
                      <Check className="size-4" />
                    </span>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-white">
                        Refund issued from the resumed run
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-white/34">
                        checkpoint cp_04 → issueRefund → __end__
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsResumed(false)}
                      aria-label="Replay refund approval demo"
                      className="grid size-7 place-items-center rounded-lg text-white/35 hover:bg-white/6 hover:text-white"
                    >
                      <RotateCcw className="size-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-3 font-mono text-[10px] text-white/28">
            <span>structured stream</span>
            <span className="size-0.5 rounded-full bg-white/25" />
            <span>checkpointed input</span>
            <span className="size-0.5 rounded-full bg-white/25" />
            <span>React state</span>
          </div>
        </div>
      </div>
    </div>
  );
}
