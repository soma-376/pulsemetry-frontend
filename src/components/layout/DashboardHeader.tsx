"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { FilterToolbar } from "./FilterToolbar";
import { IngestStatusBar } from "./IngestStatusBar";
import { ingestStatusOptions } from "@/lib/api/ingest-status";
import { useBackendSession } from "@/lib/api/session";
import { useFilters } from "@/lib/filters";

type PageRefresh = { refresh: () => void; refreshing: boolean };
const RegisterRefresh = createContext<
  ((value: PageRefresh | null) => void) | null
>(null);
/** 화면이 등록한 CSV 내보내기. `run`이 없으면 `disabledReason`을 버튼에 보인다. */
type PageExport = {
  run: (() => Promise<void> | void) | null;
  disabledReason: string;
};
const RegisterExport = createContext<
  ((value: PageExport | null) => void) | null
>(null);
const NO_EXPORT = "이 화면에는 CSV로 내보낼 목록이 없습니다";

/** 페이지는 재조회 동작만 등록하고, 공통 헤더와 조직 상태 조회는 셸이 담당한다. */
export function DashboardHeaderProvider({
  children,
  todayIso,
}: {
  children: ReactNode;
  todayIso: string;
}) {
  const [page, setPage] = useState<PageRefresh | null>(null);
  const register = useCallback(
    (value: PageRefresh | null) => setPage(value),
    [],
  );
  const [pageExport, setPageExport] = useState<PageExport | null>(null);
  const registerExport = useCallback(
    (value: PageExport | null) => setPageExport(value),
    [],
  );
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const runExport = async () => {
    if (!pageExport?.run || exporting) return;
    setExporting(true);
    setExportError("");
    try {
      await pageExport.run();
    } catch (cause) {
      setExportError(
        cause instanceof Error
          ? `CSV를 만들지 못했습니다. ${cause.message}`
          : "CSV를 만들지 못했습니다.",
      );
    } finally {
      setExporting(false);
    }
  };
  const session = useBackendSession();
  const { autoRefresh } = useFilters();
  const organizationId = session?.user.organizationId ?? "";
  const ingest = useQuery({
    ...ingestStatusOptions(organizationId),
    refetchInterval: autoRefresh ? 300_000 : false,
  });

  return (
    <RegisterRefresh.Provider value={register}>
      <RegisterExport.Provider value={registerExport}>
        <header className="sticky top-0 z-30 shrink-0 bg-card">
          <FilterToolbar
            todayIso={todayIso}
            refreshing={!!page?.refreshing || ingest.isFetching}
            csv={{
              disabledReason: pageExport?.run
                ? null
                : (pageExport?.disabledReason ?? NO_EXPORT),
              exporting,
              onExport: () => void runExport(),
            }}
            onRefresh={() => {
              page?.refresh();
              if (organizationId) void ingest.refetch({ cancelRefetch: false });
            }}
          />
          {exportError && (
            <p
              role="alert"
              className="border-b border-border px-4 py-1.5 text-xs text-red"
            >
              {exportError}
            </p>
          )}
          <IngestStatusBar query={ingest} enabled={!!organizationId} />
        </header>
        {children}
      </RegisterExport.Provider>
    </RegisterRefresh.Provider>
  );
}

export function useDashboardPageRefresh(
  refresh: () => void,
  refreshing: boolean,
) {
  const register = useContext(RegisterRefresh);
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  }, [refresh]);
  useEffect(() => {
    register?.({ refresh: () => latest.current(), refreshing });
    return () => register?.(null);
  }, [register, refreshing]);
}

/**
 * 화면이 공통 헤더의 CSV 버튼에 내보내기를 등록한다. [run] 이 null 이면 버튼은 [disabledReason] 을 보이며 꺼진다.
 * 내보내기는 그 화면이 보이는 조건(기간·비교·snapshot)의 응답으로만 만든다(csv-export.ts).
 */
export function useDashboardPageExport(
  run: (() => Promise<void> | void) | null,
  disabledReason: string,
) {
  const register = useContext(RegisterExport);
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  }, [run]);
  const available = !!run;
  useEffect(() => {
    register?.({
      run: available ? () => latest.current?.() : null,
      disabledReason,
    });
    return () => register?.(null);
  }, [register, available, disabledReason]);
}
