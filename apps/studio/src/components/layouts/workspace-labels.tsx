"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type Labels = Record<string, { title: string; owner: symbol }>;
const WorkspaceLabels = createContext<{
  labels: Labels;
  register: (path: string, title: string) => () => void;
} | null>(null);

/** Mounted route content supplies display titles from its existing server data. */
export function WorkspaceLabelsProvider({ children }: { children: ReactNode }) {
  const [labels, setLabels] = useState<Labels>({});
  const register = useCallback((path: string, title: string) => {
    const owner = Symbol(path);
    setLabels((current) => ({ ...current, [path]: { title, owner } }));
    return () => {
      setLabels((current) => {
        if (current[path]?.owner !== owner) return current;
        const next = { ...current };
        delete next[path];
        return next;
      });
    };
  }, []);
  const value = useMemo(() => ({ labels, register }), [labels, register]);
  return (
    <WorkspaceLabels.Provider value={value}>
      {children}
    </WorkspaceLabels.Provider>
  );
}

export function useWorkspaceLabel(path: string, title: string) {
  const register = useContext(WorkspaceLabels)?.register;
  useEffect(() => register?.(path, title), [register, path, title]);
}

export function useWorkspaceLabels() {
  return useContext(WorkspaceLabels)?.labels;
}
