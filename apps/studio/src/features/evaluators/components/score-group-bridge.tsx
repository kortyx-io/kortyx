"use client";
import type {
  ScoreGroupAsset,
  ScoreGroupVersion,
} from "@kortyx/telemetry-contracts";
import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useRef,
} from "react";

type Owner = {
  canUse: () => boolean;
  use: (version: ScoreGroupVersion, asset: ScoreGroupAsset) => void;
  saved: (asset: ScoreGroupAsset) => void;
};
const Bridge = createContext<{
  register: (path: string, owner: Owner) => () => void;
  get: (path: string) => Owner | undefined;
} | null>(null);
/** Commands between retained drawer layers; server data stays in route props. */
export function ScoreGroupBridge({ children }: { children: ReactNode }) {
  const owners = useRef(new Map<string, Owner>());
  const value = useMemo(
    () => ({
      register(path: string, owner: Owner) {
        owners.current.set(path, owner);
        return () => {
          if (owners.current.get(path) === owner) owners.current.delete(path);
        };
      },
      get: (path: string) => owners.current.get(path),
    }),
    [],
  );
  return <Bridge.Provider value={value}>{children}</Bridge.Provider>;
}
export const useScoreGroupBridge = () => useContext(Bridge);
