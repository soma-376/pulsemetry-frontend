"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilterToolbar } from "./FilterToolbar";
import { IngestStatusBar } from "./IngestStatusBar";
import { ingestStatusOptions } from "@/lib/api/ingest-status";
import { useBackendSession } from "@/lib/api/session";
import { useFilters } from "@/lib/filters";

type PageRefresh = { refresh: () => void; refreshing: boolean };
const RegisterRefresh = createContext<((value: PageRefresh | null) => void) | null>(null);

/** 페이지는 재조회 동작만 등록하고, 공통 헤더와 조직 상태 조회는 셸이 담당한다. */
export function DashboardHeaderProvider({ children, todayIso }: { children: ReactNode; todayIso: string }) {
  const [page, setPage] = useState<PageRefresh | null>(null);
  const register = useCallback((value: PageRefresh | null) => setPage(value), []);
  const session = useBackendSession();
  const { autoRefresh } = useFilters();
  const organizationId = session?.user.organizationId ?? process.env.NEXT_PUBLIC_ORGANIZATION_ID ?? "";
  const ingest = useQuery({ ...ingestStatusOptions(organizationId), refetchInterval: autoRefresh ? 300_000 : false });

  return <RegisterRefresh.Provider value={register}>
    <header className="sticky top-0 z-30 shrink-0 bg-card">
      <FilterToolbar todayIso={todayIso} csvDisabled refreshing={!!page?.refreshing || ingest.isFetching}
        onRefresh={() => { page?.refresh(); if (organizationId) void ingest.refetch({ cancelRefetch: false }); }} />
      <IngestStatusBar query={ingest} enabled={!!organizationId} />
    </header>
    {children}
  </RegisterRefresh.Provider>;
}

export function useDashboardPageRefresh(refresh: () => void, refreshing: boolean) {
  const register = useContext(RegisterRefresh);
  const latest = useRef(refresh);
  useEffect(() => { latest.current = refresh; }, [refresh]);
  useEffect(() => {
    register?.({ refresh: () => latest.current(), refreshing });
    return () => register?.(null);
  }, [register, refreshing]);
}
