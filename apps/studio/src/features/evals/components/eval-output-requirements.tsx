import type { EvalOutputExpectation } from "@kortyx/agent/evals";

export function EvalOutputRequirements({
  outputs,
}: {
  outputs: readonly EvalOutputExpectation[] | undefined;
}) {
  if (!outputs?.length) return null;
  return (
    <section
      aria-label="Required structured outputs"
      className="min-w-0 space-y-2"
    >
      <p className="text-xs font-medium text-muted-foreground">
        Required structured outputs
      </p>
      <ul className="space-y-1.5">
        {outputs.map((output, index) => (
          <li
            key={`${index}:${output.schemaId}`}
            className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-xs"
          >
            <code
              translate="no"
              className="break-all font-mono text-foreground"
            >
              {output.schemaId}
            </code>
            <span className="text-muted-foreground">
              {output.schemaVersion === undefined
                ? "Any version"
                : `v${output.schemaVersion}`}{" "}
              · Completed output required
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
