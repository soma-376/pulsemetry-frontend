"use client";

import { useSyncExternalStore } from "react";
import { subscribeSessionState, getBackendSession } from "@/lib/api/session";

/** 세션 확인은 공통 화면 가드가 소유한다. 각 소비자가 별도로 /me를 호출하지 않는다. */
export function useBackendSession() {
  return useSyncExternalStore(
    subscribeSessionState,
    getBackendSession,
    () => null,
  );
}
