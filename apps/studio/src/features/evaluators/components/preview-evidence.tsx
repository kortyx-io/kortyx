import { z } from "zod";

const previewSchema = z.object({
  evidence: z.object({ captured: z.unknown(), omitted: z.array(z.string()) }),
  messages: z.array(z.object({ role: z.string(), content: z.string() })),
});
const conversationSchema = z.object({
  steps: z.array(
    z.object({
      index: z.number().int().nonnegative().optional(),
      input: z.unknown(),
      observation: z.object({ type: z.string(), text: z.string().optional() }),
    }),
  ),
});
const eventsSchema = z.object({
  status: z.string(),
  events: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      payload: z.record(z.string(), z.unknown()),
    }),
  ),
});
export function PreviewEvidence({ value }: { value: unknown }) {
  const preview = previewSchema.safeParse(value);
  if (!preview.success)
    return (
      <p className="text-sm text-muted-foreground">
        The selected evidence could not be displayed.
      </p>
    );
  const conversation = conversationSchema.safeParse(
    preview.data.evidence.captured,
  );
  const recording = eventsSchema.safeParse(preview.data.evidence.captured);
  return (
    <section
      className="flex min-w-0 flex-col gap-4"
      aria-label="Selected evidence"
    >
      <h3 className="text-sm font-medium">Evidence used by this judge</h3>
      {conversation.success &&
        conversation.data.steps.map((step, index) => (
          <div
            key={step.index ?? JSON.stringify(step.input)}
            className="flex flex-col gap-2 rounded-md border p-3 text-sm"
          >
            <p className="font-medium">Conversation step {index + 1}</p>
            <p className="text-xs text-muted-foreground">Recorded input</p>
            <pre className="whitespace-pre-wrap break-words text-xs">
              {JSON.stringify(step.input, null, 2)}
            </pre>
            <p className="text-xs text-muted-foreground">
              Recorded {step.observation.type}
            </p>
            <p className="whitespace-pre-wrap break-words">
              {step.observation.text || "Response text was not captured."}
            </p>
          </div>
        ))}
      {recording.success && (
        <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
          <p>Recorded state · {recording.data.status}</p>
          <p>{recording.data.events.length} selected events</p>
          <p className="text-xs text-muted-foreground">
            Inspect the full recording for captured inputs, outcomes and tool
            evidence.
          </p>
        </div>
      )}
      <details>
        <summary className="cursor-pointer text-sm">
          Evidence limitations
        </summary>
        <ul className="mt-2 flex list-disc flex-col gap-2 pl-4 text-xs text-muted-foreground">
          {preview.data.evidence.omitted.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </details>
      <details>
        <summary className="cursor-pointer text-sm">
          Rendered judge messages
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          {preview.data.messages.map((message, index) => (
            <div key={`${message.role}-${index}`}>
              <p className="text-xs font-medium capitalize">{message.role}</p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">
                {message.content}
              </pre>
            </div>
          ))}
        </div>
      </details>
      <details>
        <summary className="cursor-pointer text-sm">
          Full recording JSON
        </summary>
        <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(preview.data.evidence, null, 2)}
        </pre>
      </details>
    </section>
  );
}
