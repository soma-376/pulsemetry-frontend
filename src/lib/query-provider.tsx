"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { AuthError, subscribeBackendIdentityChange } from "@/lib/api/session";

/** 루트 인스턴스별 캐시. 페이지 이동과 토큰 갱신에서는 유지한다. */
export function QueryProvider({ children }: { children: ReactNode }) {
  // 인증 실패(요청 제한 429 포함)는 다시 시도하지 않는다 — 세션 갱신이 이미 서버가 준 시간만큼 기다렸다가 한 번 다시 보냈다.
  // 그 밖의 오류는 TanStack Query 기본값(3회)을 따른다.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (failures, error) =>
              failures < 3 && !(error instanceof AuthError),
          },
        },
      }),
  );
  useEffect(() => {
    // 세션 구독자에게 새 계정을 알리기 전에 이전 계정의 요청·캐시를 정리한다.
    const unsubscribe = subscribeBackendIdentityChange(() => client.clear());
    return () => {
      unsubscribe();
      client.clear();
    };
  }, [client]);
  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
