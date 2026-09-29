"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { subscribeBackendIdentityChange } from "@/lib/api/session";

/** 루트 인스턴스별 캐시. 페이지 이동과 토큰 갱신에서는 유지한다. */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  useEffect(() => {
    // 세션 구독자에게 새 계정을 알리기 전에 이전 계정의 요청·캐시를 정리한다.
    const unsubscribe = subscribeBackendIdentityChange(() => client.clear());
    return () => {
      unsubscribe();
      client.clear();
    };
  }, [client]);
  return <QueryClientProvider client={client}>
    {children}
    {process.env.NODE_ENV === "development" && <ReactQueryDevtools initialIsOpen={false} />}
  </QueryClientProvider>;
}
