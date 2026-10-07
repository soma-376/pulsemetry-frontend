"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
/** 서버 렌더링과 첫 hydration 에서는 false, 그 뒤 true. 브라우저 저장소(세션)를 읽기 전의 렌더를 구분한다. */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
