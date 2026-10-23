"use client";

import type { unstable_AdapterInterface } from "nuqs/adapters/custom";
import { createContext } from "react";

export const StudioQueryContext =
  createContext<unstable_AdapterInterface | null>(null);
