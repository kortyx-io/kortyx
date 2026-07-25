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
import { DETAIL_MOTION_DURATION_MS } from "@/components/detail/detail-motion";

type DetailSlotMotionValue = {
  active: boolean;
  entered: boolean;
  markEntered: () => void;
};

const DetailSlotMotionContext = createContext<DetailSlotMotionValue>({
  active: true,
  entered: false,
  markEntered: () => undefined,
});

export function useDetailSlotMotion() {
  return useContext(DetailSlotMotionContext);
}

/**
 * Parallel-route slots are replaced immediately during Browser Back/Forward.
 * Retain the last detail slot for exactly the shared motion duration so the
 * drawer can perform the same exit transition as an explicit close.
 */
export function DetailSlotPresence({ children }: { children: ReactNode }) {
  const active = children !== null && children !== undefined;
  const [renderedChildren, setRenderedChildren] = useState<ReactNode>(
    active ? children : null,
  );
  const [entered, setEntered] = useState(false);
  const markEntered = useCallback(() => setEntered(true), []);
  const motion = useMemo(
    () => ({ active, entered, markEntered }),
    [active, entered, markEntered],
  );

  useEffect(() => {
    if (active) {
      setRenderedChildren(children);
      return;
    }
    const timer = window.setTimeout(() => {
      setRenderedChildren(null);
      setEntered(false);
    }, DETAIL_MOTION_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [active, children]);

  return (
    <DetailSlotMotionContext.Provider value={motion}>
      {renderedChildren}
    </DetailSlotMotionContext.Provider>
  );
}
