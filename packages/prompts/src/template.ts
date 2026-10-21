import { canonicalPromptJson, PromptError } from "./contracts";

declare const variableType: unique symbol;
/** A declaration-time reference, never the runtime value of an input. */
export type PromptVariable<T> = { readonly [variableType]: T };
export type PromptVariables<T> = PromptVariable<T> &
  (NonNullable<T> extends readonly unknown[]
    ? unknown
    : NonNullable<T> extends object
      ? {
          readonly [K in keyof NonNullable<T>]-?: PromptVariables<
            NonNullable<T>[K]
          >;
        }
      : unknown);

const paths = new WeakMap<object, string>();

/** Build typed references for a declarative template. No input data is read here. */
export function promptVariablesFor<T extends object>(): PromptVariables<T> {
  const reference = (path: string): object => {
    const value = new Proxy(Object.create(null) as object, {
      get(_target, key) {
        if (typeof key !== "string" || key === "toString" || key === "valueOf")
          throw new PromptError(
            "PROMPT_VARIABLE_COERCION",
            "Use promptText to interpolate template variables.",
          );
        if (["__proto__", "constructor", "prototype"].includes(key))
          throw new PromptError(
            "PROMPT_VARIABLE_UNKNOWN",
            "Invalid template variable path.",
          );
        return reference(path ? `${path}.${key}` : key);
      },
    });
    paths.set(value, path);
    return value;
  };
  return reference("") as PromptVariables<T>;
}

/** Declare a portable template. Runtime objects are serialized by compilePrompt. */
export function promptText(
  parts: TemplateStringsArray,
  ...values: readonly unknown[]
): string {
  return parts.reduce((text, part, index) => {
    if (!index) return part;
    const value = values[index - 1];
    const path =
      value !== null && typeof value === "object"
        ? paths.get(value)
        : undefined;
    if (path !== undefined) {
      if (!path)
        throw new PromptError(
          "PROMPT_VARIABLE_UNKNOWN",
          "Select a named template input.",
        );
      return `${text}{{${path}}}${part}`;
    }
    const literal =
      typeof value === "string" ? value : canonicalPromptJson(value ?? null);
    // Literal interpolation must not introduce executable placeholders or includes.
    if (/\{\{|\[\[prompt:/.test(literal))
      throw new PromptError(
        "PROMPT_LITERAL_INVALID",
        "Put template variables in the template declaration, not in interpolated literals.",
      );
    return text + literal + part;
  }, "");
}
