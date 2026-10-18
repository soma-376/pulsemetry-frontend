"use client";

import { useSyncExternalStore } from "react";
import {
  subscribeSessionState,
  getSessionState,
  getServerSessionState,
} from "@/lib/api/session";

export function useSessionState() {
  return useSyncExternalStore(
    subscribeSessionState,
    getSessionState,
    getServerSessionState,
  );
}
