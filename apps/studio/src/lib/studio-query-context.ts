"use client";

import type { unstable_AdapterInterface } from "nuqs/adapters/custom";
import { createContext } from "react";

export const StudioQueryContext = createContext<Pick<
  unstable_AdapterInterface,
  "pathname" | "searchParams"
> | null>(null);
