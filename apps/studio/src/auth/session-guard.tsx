"use client";

import { useEffect } from "react";
import { monitorStudioSession } from "./session-monitor";

export function StudioSessionGuard() {
  useEffect(() => monitorStudioSession(window), []);
  return null;
}
