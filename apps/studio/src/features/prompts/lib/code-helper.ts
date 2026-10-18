import type { PromptDetail } from "@kortyx/telemetry-contracts";

export function promptCode(
  key: string,
  version: PromptDetail["versions"][number],
) {
  return `import { createPrompts, definePrompt, studioPromptSource, usePrompt, useReason } from "kortyx";\nimport { z } from "zod";\n\nconst promptRef = definePrompt({\n  id: ${JSON.stringify(key)},\n  format: ${JSON.stringify(version.content.format)},\n  variables: z.fromJSONSchema(${JSON.stringify(version.content.variablesSchema, null, 2)}),\n  config: z.fromJSONSchema(${JSON.stringify(version.content.configSchema, null, 2)}),\n});\n\nconst prompts = createPrompts({\n  definitions: [promptRef],\n  source: studioPromptSource({\n    apiUrl: process.env.KORTYX_API_URL!,\n    apiKey: process.env.KORTYX_PROMPTS_API_KEY!,\n    tag: "live", // optional: defaults to live\n  }),\n});\n// Pass prompts to createAgent({ ...yourAgentOptions, prompts }).\n\n// Inside a workflow node:\nconst prompt = await usePrompt(promptRef, {\n  variables: input, // validated against the template input contract\n  version: ${version.version}, // omit to use the live version (or the source tag)\n});\n\nawait useReason({\n  prompt, // preserves system + user, or the complete ordered chat\n  model: myModel, // optionally map prompt.config.modelName to your model registry\n});`;
}
