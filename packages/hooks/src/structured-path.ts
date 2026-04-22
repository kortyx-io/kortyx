export const parseStructuredPath = (path: string, source: string): string[] => {
  if (path.length === 0) {
    throw new Error(`${source} path must be a non-empty dot-separated string.`);
  }

  const parts = path.split(".");
  if (parts.some((part) => part.length === 0)) {
    throw new Error(
      `${source} path "${path}" must not contain empty segments.`,
    );
  }

  return parts;
};

export const assertStructuredPath = (path: string, source: string): void => {
  parseStructuredPath(path, source);
};
