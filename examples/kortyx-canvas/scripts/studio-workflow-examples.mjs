import { createKortyxTelemetryAdapter } from "@kortyx/telemetry";
import { createAgent } from "kortyx";
import { workflows } from "./studio-example-workflows.mjs";

const endpoint =
  process.env.KORTYX_TELEMETRY_API_URL ?? process.env.KORTYX_API_URL;
const apiKey = process.env.KORTYX_TELEMETRY_API_KEY;
if (
  !endpoint ||
  !apiKey ||
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(endpoint).hostname)
) {
  throw new Error(
    "Set a loopback KORTYX_TELEMETRY_API_URL and KORTYX_TELEMETRY_API_KEY for local Studio.",
  );
}
const telemetry = createKortyxTelemetryAdapter({
  endpoint,
  apiKey,
  environment: "development",
  service: { name: "studio-workflow-examples" },
  tags: ["studio-workflow-examples"],
});
const agent = createAgent({
  workflows,
  defaultWorkflowId: workflows[0].id,
  telemetry,
});
for (const definition of workflows) {
  const routes = definition.id.endsWith("multiple-exits")
    ? ["approve", "reject", "review"]
    : definition.id.endsWith("retry-loop")
      ? ["valid", "fallback"]
      : definition.id.endsWith("early-exit")
        ? ["skip", "continue"]
        : definition.id.endsWith("complex")
          ? ["manual", "auto", "fallback"]
          : [undefined];
  for (const route of routes) {
    const result = await agent.execute({
      workflow: definition,
      input: route ? { route } : {},
    });
    if (result.status !== "completed")
      throw new Error(`${definition.id}: ${JSON.stringify(result)}`);
    console.log(`${definition.id}${route ? ` (${route})` : ""}: completed`);
  }
}
await telemetry.flush();
if (
  telemetry.getDroppedEventCount() ||
  telemetry.getPermanentDeliveryFailureCount()
) {
  throw new Error("Example telemetry delivery failed.");
}
console.log(
  "Open Studio /workflows?range=All+time and search studio-example to inspect the seven workflows.",
);
