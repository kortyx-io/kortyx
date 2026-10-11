import { PromptKeySchema } from "@kortyx/prompts/browser";

export function promptKeyError(key: string): string | null {
  const result = PromptKeySchema.safeParse(key);
  if (result.success) return null;
  if (!key.length) return "Enter a prompt key.";
  if (key.length > 200) return "Use 200 characters or fewer.";
  return "Start with a letter or number. Use only letters, numbers, /, ., _ or -; no spaces.";
}
