import type { UseReasonStructuredConfig } from "../types";

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findTopLevelArrayStart = (text: string, path: string): number => {
  const match = new RegExp(`"${escapeRegex(path)}"\\s*:\\s*\\[`).exec(text);
  return match ? match.index + match[0].length : -1;
};

export const resolveAppendFieldPaths = (
  cfg: UseReasonStructuredConfig | undefined,
): string[] => {
  const fields = cfg?.fields;
  if (!fields) return [];

  const appendPaths = Object.entries(fields)
    .filter(([, mode]) => mode === "append")
    .map(([path]) => path);

  for (const path of appendPaths) {
    if (!path || path.includes(".")) {
      throw new Error(
        "useReason structured append streaming currently supports top-level array fields only.",
      );
    }
  }

  return appendPaths;
};

export const resolveSetFieldPaths = (
  cfg: UseReasonStructuredConfig | undefined,
): string[] => {
  const fields = cfg?.fields;
  if (!fields) return [];

  const setPaths = Object.entries(fields)
    .filter(([, mode]) => mode === "set")
    .map(([path]) => path);

  for (const path of setPaths) {
    if (!path || path.includes(".")) {
      throw new Error(
        "useReason structured set streaming currently supports top-level fields only.",
      );
    }
  }

  return setPaths;
};

export const resolveTextDeltaFieldPaths = (
  cfg: UseReasonStructuredConfig | undefined,
): string[] => {
  const fields = cfg?.fields;
  if (!fields) return [];

  const textPaths = Object.entries(fields)
    .filter(([, mode]) => mode === "text-delta")
    .map(([path]) => path);

  for (const path of textPaths) {
    if (!path || path.includes(".")) {
      throw new Error(
        "useReason structured text-delta streaming currently supports top-level string fields only.",
      );
    }
  }

  return textPaths;
};

const findTopLevelFieldValueStart = (text: string, path: string): number => {
  const match = new RegExp(`"${escapeRegex(path)}"\\s*:\\s*`).exec(text);
  return match ? match.index + match[0].length : -1;
};

const findTopLevelStringStart = (text: string, path: string): number => {
  const match = new RegExp(`"${escapeRegex(path)}"\\s*:\\s*"`).exec(text);
  return match ? match.index + match[0].length : -1;
};

const extractCompletedStringValueAt = (args: {
  text: string;
  start: number;
}): { complete: boolean; value?: string } => {
  let value = "";

  for (let i = args.start; i < args.text.length; i += 1) {
    const ch = args.text[i];
    if (ch === undefined) break;

    if (ch === '"') {
      return {
        complete: true,
        value,
      };
    }

    if (ch !== "\\") {
      value += ch;
      continue;
    }

    const next = args.text[i + 1];
    if (!next) {
      return {
        complete: false,
      };
    }

    if (
      next === '"' ||
      next === "\\" ||
      next === "/" ||
      next === "b" ||
      next === "f" ||
      next === "n" ||
      next === "r" ||
      next === "t"
    ) {
      value +=
        next === "b"
          ? "\b"
          : next === "f"
            ? "\f"
            : next === "n"
              ? "\n"
              : next === "r"
                ? "\r"
                : next === "t"
                  ? "\t"
                  : next;
      i += 1;
      continue;
    }

    if (next === "u") {
      const hex = args.text.slice(i + 2, i + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
        return {
          complete: false,
        };
      }
      value += String.fromCharCode(Number.parseInt(hex, 16));
      i += 5;
      continue;
    }

    return {
      complete: false,
    };
  }

  return {
    complete: false,
  };
};

const extractCompletedNestedValueAt = (args: {
  text: string;
  start: number;
  opener: "{" | "[";
  closer: "}" | "]";
}): { complete: boolean; value?: unknown } => {
  let inString = false;
  let isEscaped = false;
  let nesting = 0;

  for (let i = args.start; i < args.text.length; i += 1) {
    const ch = args.text[i];
    if (ch === undefined) break;

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (ch === "\\") {
        isEscaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === args.opener) {
      nesting += 1;
      continue;
    }

    if (ch === args.closer) {
      nesting -= 1;
      if (nesting === 0) {
        const raw = args.text.slice(args.start, i + 1);
        try {
          return {
            complete: true,
            value: JSON.parse(raw),
          };
        } catch {
          return {
            complete: false,
          };
        }
      }
    }
  }

  return {
    complete: false,
  };
};

export const extractCompletedFieldValue = (args: {
  text: string;
  path: string;
}): { found: boolean; complete: boolean; value?: unknown } => {
  const start = findTopLevelFieldValueStart(args.text, args.path);
  if (start < 0) {
    return {
      found: false,
      complete: false,
    };
  }

  const first = args.text[start];
  if (!first) {
    return {
      found: true,
      complete: false,
    };
  }

  if (first === '"') {
    const parsed = extractCompletedStringValueAt({
      text: args.text,
      start: start + 1,
    });
    return parsed.complete
      ? {
          found: true,
          complete: true,
          value: parsed.value,
        }
      : {
          found: true,
          complete: false,
        };
  }

  if (first === "{") {
    const parsed = extractCompletedNestedValueAt({
      text: args.text,
      start,
      opener: "{",
      closer: "}",
    });
    return parsed.complete
      ? {
          found: true,
          complete: true,
          value: parsed.value,
        }
      : {
          found: true,
          complete: false,
        };
  }

  if (first === "[") {
    const parsed = extractCompletedNestedValueAt({
      text: args.text,
      start,
      opener: "[",
      closer: "]",
    });
    return parsed.complete
      ? {
          found: true,
          complete: true,
          value: parsed.value,
        }
      : {
          found: true,
          complete: false,
        };
  }

  for (let i = start; i < args.text.length; i += 1) {
    const ch = args.text[i];
    if (ch === undefined) break;
    if (ch !== "," && ch !== "}") continue;

    const raw = args.text.slice(start, i).trim();
    if (!raw) {
      return {
        found: true,
        complete: false,
      };
    }

    try {
      return {
        found: true,
        complete: true,
        value: JSON.parse(raw),
      };
    } catch {
      return {
        found: true,
        complete: false,
      };
    }
  }

  return {
    found: true,
    complete: false,
  };
};

export const extractCompletedArrayItems = (args: {
  text: string;
  path: string;
}): unknown[] => {
  const start = findTopLevelArrayStart(args.text, args.path);
  if (start < 0) return [];

  const items: unknown[] = [];
  let inString = false;
  let isEscaped = false;
  let nesting = 0;
  let itemStart = -1;

  for (let i = start; i < args.text.length; i += 1) {
    const ch = args.text[i];
    if (ch === undefined) break;

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (ch === "\\") {
        isEscaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      if (itemStart < 0) itemStart = i;
      continue;
    }

    if (itemStart < 0) {
      if (/\s/.test(ch) || ch === ",") continue;
      if (ch === "]") break;
      itemStart = i;
      if (ch === "{" || ch === "[") {
        nesting = 1;
      } else {
        nesting = 0;
      }
      continue;
    }

    if (ch === "{" || ch === "[") {
      nesting += 1;
      continue;
    }

    if (ch === "}" || ch === "]") {
      if (nesting > 0) {
        nesting -= 1;
        if (nesting > 0) continue;
      }

      if (ch === "]") {
        const raw = args.text.slice(itemStart, i).trim();
        if (raw) {
          try {
            items.push(JSON.parse(raw));
          } catch {}
        }
        break;
      }
    }

    if (nesting === 0 && (ch === "," || ch === "]")) {
      const raw = args.text.slice(itemStart, i).trim();
      if (raw) {
        try {
          items.push(JSON.parse(raw));
        } catch {}
      }
      itemStart = -1;
      if (ch === "]") break;
    }
  }

  return items;
};

export const extractStreamingStringValue = (args: {
  text: string;
  path: string;
}): { found: boolean; complete: boolean; value: string } => {
  const start = findTopLevelStringStart(args.text, args.path);
  if (start < 0) {
    return {
      found: false,
      complete: false,
      value: "",
    };
  }

  let value = "";

  for (let i = start; i < args.text.length; i += 1) {
    const ch = args.text[i];
    if (ch === undefined) break;

    if (ch === '"') {
      return {
        found: true,
        complete: true,
        value,
      };
    }

    if (ch !== "\\") {
      value += ch;
      continue;
    }

    const next = args.text[i + 1];
    if (!next) {
      return {
        found: true,
        complete: false,
        value,
      };
    }

    if (
      next === '"' ||
      next === "\\" ||
      next === "/" ||
      next === "b" ||
      next === "f" ||
      next === "n" ||
      next === "r" ||
      next === "t"
    ) {
      value +=
        next === "b"
          ? "\b"
          : next === "f"
            ? "\f"
            : next === "n"
              ? "\n"
              : next === "r"
                ? "\r"
                : next === "t"
                  ? "\t"
                  : next;
      i += 1;
      continue;
    }

    if (next === "u") {
      const hex = args.text.slice(i + 2, i + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
        return {
          found: true,
          complete: false,
          value,
        };
      }
      value += String.fromCharCode(Number.parseInt(hex, 16));
      i += 5;
      continue;
    }

    return {
      found: true,
      complete: false,
      value,
    };
  }

  return {
    found: true,
    complete: false,
    value,
  };
};
