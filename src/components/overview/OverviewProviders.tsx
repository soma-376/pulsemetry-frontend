"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FiltersProvider } from "@/lib/filters";

/** 개요를 벗어나면 캐시를 폐기한다. SSR 요청 간에도 클라이언트를 공유하지 않는다. */
export function OverviewProviders({ todayIso, children }: { todayIso: string; children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}><FiltersProvider todayIso={todayIso}>{children}</FiltersProvider></QueryClientProvider>;
}
