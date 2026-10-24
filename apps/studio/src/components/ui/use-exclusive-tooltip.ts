"use client";

import { useCallback, useEffect, useId } from "react";

const tooltipOpened = "studio:tooltip-opened";

/** Coordinate help popovers and ordinary tooltips across portals in this document. */
export function useExclusiveTooltip(dismiss: () => void) {
  const id = useId();
  useEffect(() => {
    const closeOther = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) dismiss();
    };
    document.addEventListener(tooltipOpened, closeOther);
    return () => document.removeEventListener(tooltipOpened, closeOther);
  }, [dismiss, id]);

  return useCallback(() => {
    document.dispatchEvent(new CustomEvent(tooltipOpened, { detail: id }));
  }, [id]);
}
