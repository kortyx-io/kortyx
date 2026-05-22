import { assertStructuredPath, parseStructuredPath } from "../structured-path";
import type { UseReasonStructuredConfig } from "../types";

export const resolveAppendFieldPaths = (
  cfg: UseReasonStructuredConfig | undefined,
): string[] => {
  const fields = cfg?.fields;
  if (!fields) return [];

  const appendPaths = Object.entries(fields)
    .filter(([, mode]) => mode === "append")
    .map(([path]) => path);

  for (const path of appendPaths) {
    assertStructuredPath(path, "useReason structured append");
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
    assertStructuredPath(path, "useReason structured set");
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
    assertStructuredPath(path, "useReason structured text-delta");
  }

  return textPaths;
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

const skipWhitespace = (text: string, start: number): number => {
  let i = start;
  while (i < text.length && /\s/.test(text[i] ?? "")) i += 1;
  return i;
};

const pathSegmentMatches = (patternPart: string, actualPart: string): boolean =>
  patternPart === "*" || patternPart === actualPart;

const pathMatchesPattern = (
  actualParts: string[],
  patternParts: string[],
): boolean =>
  actualParts.length === patternParts.length &&
  actualParts.every((part, index) =>
    pathSegmentMatches(patternParts[index] ?? "", part),
  );

const isPathPrefix = (prefix: string[], full: string[]): boolean =>
  prefix.length <= full.length &&
  prefix.every((part, index) => pathSegmentMatches(full[index] ?? "", part));

const parseStringToken = (
  text: string,
  start: number,
): { complete: boolean; end?: number; value?: string } => {
  if (text[start] !== '"') return { complete: false };

  const parsed = extractCompletedStringValueAt({ text, start: start + 1 });
  if (!parsed.complete || parsed.value === undefined)
    return { complete: false };

  let inEscape = false;
  for (let i = start + 1; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === undefined) break;

    if (inEscape) {
      inEscape = false;
      if (ch === "u") i += 4;
      continue;
    }

    if (ch === "\\") {
      inEscape = true;
      continue;
    }

    if (ch === '"') {
      return {
        complete: true,
        end: i + 1,
        value: parsed.value,
      };
    }
  }

  return { complete: false };
};

const skipNestedValue = (
  text: string,
  start: number,
): { complete: boolean; end?: number } => {
  const opener = text[start];
  const closer = opener === "{" ? "}" : "]";
  let inString = false;
  let isEscaped = false;
  let nesting = 0;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
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

    if (ch === opener) {
      nesting += 1;
      continue;
    }

    if (ch === closer) {
      nesting -= 1;
      if (nesting === 0) {
        return { complete: true, end: i + 1 };
      }
    }
  }

  return { complete: false };
};

const skipCompleteValue = (
  text: string,
  start: number,
): { complete: boolean; end?: number } => {
  const i = skipWhitespace(text, start);
  const first = text[i];
  if (!first) return { complete: false };

  if (first === '"') {
    const parsed = parseStringToken(text, i);
    return parsed.complete && parsed.end !== undefined
      ? { complete: true, end: parsed.end }
      : { complete: false };
  }

  if (first === "{" || first === "[") {
    return skipNestedValue(text, i);
  }

  for (let j = i; j < text.length; j += 1) {
    const ch = text[j];
    if (ch !== "," && ch !== "}" && ch !== "]") continue;

    const raw = text.slice(i, j).trim();
    if (!raw) return { complete: false };

    try {
      JSON.parse(raw);
      return { complete: true, end: j };
    } catch {
      return { complete: false };
    }
  }

  return { complete: false };
};

const locateValueStart = (args: {
  text: string;
  path: string;
}): { found: boolean; start?: number } => {
  const [first] = locateValueStarts(args);
  return first
    ? {
        found: true,
        start: first.start,
      }
    : {
        found: false,
      };
};

const locateValueStarts = (args: {
  text: string;
  path: string;
}): Array<{ path: string; start: number }> => {
  const targetParts = parseStructuredPath(
    args.path,
    "useReason structured field",
  );
  const matches: Array<{ path: string; start: number }> = [];

  const visitValue = (start: number, currentParts: string[]): void => {
    const valueStart = skipWhitespace(args.text, start);
    if (pathMatchesPattern(currentParts, targetParts)) {
      matches.push({
        path: currentParts.join("."),
        start: valueStart,
      });
      return;
    }

    if (!isPathPrefix(currentParts, targetParts)) {
      return;
    }

    const first = args.text[valueStart];
    if (first === "{") visitObject(valueStart + 1, currentParts);
    if (first === "[") visitArray(valueStart + 1, currentParts);
  };

  const visitObject = (start: number, currentParts: string[]): void => {
    let i = skipWhitespace(args.text, start);

    while (i < args.text.length) {
      const ch = args.text[i];
      if (ch === "}") return;
      if (ch === ",") {
        i = skipWhitespace(args.text, i + 1);
        continue;
      }
      if (ch !== '"') return;

      const key = parseStringToken(args.text, i);
      if (!key.complete || key.end === undefined || key.value === undefined) {
        return;
      }

      i = skipWhitespace(args.text, key.end);
      if (args.text[i] !== ":") return;

      const valueStart = skipWhitespace(args.text, i + 1);
      const childParts = [...currentParts, key.value];
      if (pathMatchesPattern(childParts, targetParts)) {
        matches.push({
          path: childParts.join("."),
          start: valueStart,
        });
      } else if (isPathPrefix(childParts, targetParts)) {
        visitValue(valueStart, childParts);
      }

      const skipped = skipCompleteValue(args.text, valueStart);
      if (!skipped.complete || skipped.end === undefined) {
        return;
      }

      i = skipWhitespace(args.text, skipped.end);
      if (args.text[i] === ",") {
        i = skipWhitespace(args.text, i + 1);
        continue;
      }
      if (args.text[i] === "}") return;
      return;
    }
  };

  const visitArray = (start: number, currentParts: string[]): void => {
    let i = skipWhitespace(args.text, start);
    let index = 0;

    while (i < args.text.length) {
      if (args.text[i] === "]") return;

      const childParts = [...currentParts, String(index)];
      if (pathMatchesPattern(childParts, targetParts)) {
        matches.push({
          path: childParts.join("."),
          start: i,
        });
      } else if (isPathPrefix(childParts, targetParts)) {
        visitValue(i, childParts);
      }

      const skipped = skipCompleteValue(args.text, i);
      if (!skipped.complete || skipped.end === undefined) {
        return;
      }

      i = skipWhitespace(args.text, skipped.end);
      if (args.text[i] === ",") {
        index += 1;
        i = skipWhitespace(args.text, i + 1);
        continue;
      }
      if (args.text[i] === "]") return;
      return;
    }
  };

  visitValue(0, []);
  return matches;
};

const extractCompletedValueAt = (args: {
  text: string;
  start: number;
}): { complete: boolean; value?: unknown } => {
  const start = skipWhitespace(args.text, args.start);
  const first = args.text[start];
  if (!first) return { complete: false };

  if (first === '"') {
    const parsed = extractCompletedStringValueAt({
      text: args.text,
      start: start + 1,
    });
    return parsed.complete
      ? {
          complete: true,
          value: parsed.value,
        }
      : {
          complete: false,
        };
  }

  if (first === "{") {
    return extractCompletedNestedValueAt({
      text: args.text,
      start,
      opener: "{",
      closer: "}",
    });
  }

  if (first === "[") {
    return extractCompletedNestedValueAt({
      text: args.text,
      start,
      opener: "[",
      closer: "]",
    });
  }

  for (let i = start; i < args.text.length; i += 1) {
    const ch = args.text[i];
    if (ch === undefined) break;
    if (ch !== "," && ch !== "}" && ch !== "]") continue;

    const raw = args.text.slice(start, i).trim();
    if (!raw) return { complete: false };

    try {
      return {
        complete: true,
        value: JSON.parse(raw),
      };
    } catch {
      return { complete: false };
    }
  }

  return { complete: false };
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
  const located = locateValueStart(args);
  if (!located.found || located.start === undefined) {
    return {
      found: located.found,
      complete: false,
    };
  }

  const parsed = extractCompletedValueAt({
    text: args.text,
    start: located.start,
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
};

export const extractCompletedFieldValues = (args: {
  text: string;
  path: string;
}): Array<{ path: string; value: unknown }> => {
  const located = locateValueStarts(args);
  const values: Array<{ path: string; value: unknown }> = [];

  for (const match of located) {
    const parsed = extractCompletedValueAt({
      text: args.text,
      start: match.start,
    });
    if (!parsed.complete) continue;

    values.push({
      path: match.path,
      value: parsed.value,
    });
  }

  return values;
};

export const extractCompletedArrayItems = (args: {
  text: string;
  path: string;
}): unknown[] => {
  const located = locateValueStart(args);
  if (!located.found || located.start === undefined) return [];

  const arrayStart = skipWhitespace(args.text, located.start);
  if (args.text[arrayStart] !== "[") return [];
  const start = arrayStart + 1;

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
        continue;
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

export const extractCompletedArrayItemGroups = (args: {
  text: string;
  path: string;
}): Array<{ path: string; items: unknown[] }> => {
  return locateValueStarts(args).flatMap((match) => {
    const items = extractCompletedArrayItems({
      text: args.text,
      path: match.path,
    });
    return items.length > 0
      ? [
          {
            path: match.path,
            items,
          },
        ]
      : [];
  });
};

export const extractStreamingStringValue = (args: {
  text: string;
  path: string;
}): { found: boolean; complete: boolean; value: string } => {
  const located = locateValueStart(args);
  if (!located.found || located.start === undefined) {
    return {
      found: located.found,
      complete: false,
      value: "",
    };
  }

  const stringStart = skipWhitespace(args.text, located.start);
  if (args.text[stringStart] !== '"') {
    return {
      found: true,
      complete: false,
      value: "",
    };
  }

  let value = "";

  for (let i = stringStart + 1; i < args.text.length; i += 1) {
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

export const extractStreamingStringValues = (args: {
  text: string;
  path: string;
}): Array<{ path: string; complete: boolean; value: string }> => {
  return locateValueStarts(args).flatMap((match) => {
    const current = extractStreamingStringValue({
      text: args.text,
      path: match.path,
    });
    return current.found
      ? [
          {
            path: match.path,
            complete: current.complete,
            value: current.value,
          },
        ]
      : [];
  });
};
