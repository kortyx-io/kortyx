"use client";
import { parseAsBoolean, parseAsStringLiteral } from "nuqs";
import { PayloadViewer } from "@/components/detail/payload-viewer";
import { useStudioQueryStates } from "@/lib/nuqs";
export function EvalPayloadViewer({
  scope,
  value,
  defaultMode = "pretty",
  defaultClean = false,
}: {
  scope: string;
  value: unknown;
  defaultMode?: "pretty" | "json" | "yaml" | "markdown" | "text";
  defaultClean?: boolean;
}) {
  const [state, setState] = useStudioQueryStates(
    {
      mode: parseAsStringLiteral([
        "pretty",
        "json",
        "yaml",
        "markdown",
        "text",
      ] as const).withDefault(defaultMode),
      clean: parseAsBoolean.withDefault(defaultClean),
      wrap: parseAsBoolean.withDefault(true),
    },
    {
      shallow: true,
      urlKeys: {
        mode: `payload.${scope}.mode`,
        clean: `payload.${scope}.clean`,
        wrap: `payload.${scope}.wrap`,
      },
    },
  );
  return (
    <PayloadViewer
      value={value}
      defaultMode={defaultMode}
      defaultClean={defaultClean}
      presentation={state}
      onPresentationChange={(patch) => {
        void setState(patch);
      }}
    />
  );
}
