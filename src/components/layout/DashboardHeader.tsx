"use client";

import Link from "next/link";
import { contractInputStatusOptions } from "@/lib/api/contract-input";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageContainer } from "./PageContainer";
import { ThemeToggle } from "./ThemeToggle";
import { FilterToolbar, PeriodFilters } from "./FilterToolbar";
import { IngestStatusBar } from "./IngestStatusBar";
import { ingestStatusOptions } from "@/lib/api/ingest-status";
import { useBackendSession } from "@/lib/api/session";
import { useFilters } from "@/lib/filters";
import { NotificationBell } from "./NotificationBell";
import { alertsOptions } from "@/lib/api/alerts";
import { ManagementError } from "@/lib/api/management";
import {
  RefreshNotice,
  refreshFeedback,
  type RefreshFeedback,
} from "@/components/ui/RefreshNotice";

type PageRefresh = {
  refresh: () => void;
  refreshing: boolean;
  feedback?: RefreshFeedback;
};
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
const FilterToday = createContext<string | null>(null);
const NO_EXPORT = "이 화면에는 CSV로 내보낼 목록이 없습니다";

/** 페이지는 재조회 동작만 등록하고, 공통 헤더와 조직 상태 조회는 셸이 담당한다. */
export function DashboardHeaderProvider({
  children,
  todayIso,
}: {
  children: ReactNode;
  todayIso: string;
}) {
  const client = useQueryClient();
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
  const alertsFetching = useIsFetching({
    queryKey: alertsOptions(organizationId, "unacknowledged").queryKey,
    exact: true,
  });
  const ingest = useQuery({
    ...ingestStatusOptions(organizationId),
    refetchInterval: autoRefresh ? 300_000 : false,
  });
  const contractInput = useQuery({
    ...contractInputStatusOptions(organizationId),
    refetchInterval: autoRefresh ? 300_000 : false,
  });
  const contractDenied =
    contractInput.error instanceof ManagementError &&
    [401, 403, 404].includes(contractInput.error.status);
  const ingestDenied =
    ingest.error instanceof ManagementError &&
    [401, 403, 404].includes(ingest.error.status);
  const ingestFeedback = ingestDenied ? undefined : refreshFeedback(ingest);
  const failures = [
    page?.feedback,
    ingestFeedback,
    contractDenied ? undefined : refreshFeedback(contractInput),
  ].filter((value): value is RefreshFeedback => !!value);
  const feedback = failures.length
    ? {
        paused: failures.some((value) => value.paused),
        partial: failures.every((value) => value.partial),
        updatedAt: Math.min(...failures.map((value) => value.updatedAt)),
      }
    : undefined;

  const pageTools = {
    refreshing:
      !!page?.refreshing ||
      ingest.isFetching ||
      contractInput.isFetching ||
      alertsFetching > 0,
    csv: {
      disabledReason: pageExport?.run
        ? null
        : (pageExport?.disabledReason ?? NO_EXPORT),
      exporting,
      onExport: () => void runExport(),
    },
    onRefresh: () => {
      page?.refresh();
      if (organizationId) {
        void ingest.refetch({ cancelRefetch: false });
        void contractInput.refetch({ cancelRefetch: false });
        void client.refetchQueries(
          {
            queryKey: alertsOptions(organizationId, "unacknowledged").queryKey,
            exact: true,
            type: "active",
          },
          { cancelRefetch: false },
        );
      }
    },
  };
  return (
    <RegisterRefresh.Provider value={register}>
      <RegisterExport.Provider value={registerExport}>
        <FilterToday.Provider value={todayIso}>
          <header
            aria-label="공통 헤더"
            className="sticky top-0 z-30 shrink-0 border-b border-border bg-card"
          >
            <PageContainer className="flex min-h-16 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
              <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
                <IngestStatusBar query={ingest} enabled={!!organizationId} />
                {!contractDenied &&
                  contractInput.data &&
                  contractInput.data.requiredCount > 0 && (
                    <Link
                      href={`/settings?vendor=${encodeURIComponent(contractInput.data.vendors[0].vendorId)}`}
                      className="shrink-0 rounded border border-border px-2 py-1 text-xs font-medium text-orange-ink hover:bg-hover"
                    >
                      계약 입력 필요 {contractInput.data.requiredCount}건 →
                    </Link>
                  )}
                {!contractDenied &&
                  !contractInput.data &&
                  contractInput.isError && (
                    <button
                      type="button"
                      onClick={() => void contractInput.refetch()}
                      disabled={contractInput.isFetching}
                      className="text-xs text-text3"
                      title="클릭하여 계약 상태를 다시 조회합니다"
                    >
                      계약 상태 확인 불가
                    </button>
                  )}
              </div>
              <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
                <FilterToolbar {...pageTools} />
                <NotificationBell
                  key={organizationId}
                  organizationId={organizationId}
                />
                <ThemeToggle />
              </div>
            </PageContainer>
            {exportError && (
              <PageContainer className="pb-3">
                <p role="alert" className="text-xs text-red">
                  {exportError}
                </p>
              </PageContainer>
            )}
          </header>
          <RefreshNotice
            feedback={feedback}
            retrying={pageTools.refreshing}
            onRetry={pageTools.onRefresh}
          />
          {children}
        </FilterToday.Provider>
      </RegisterExport.Provider>
    </RegisterRefresh.Provider>
  );
}

/** 날짜·비교 조건만 현재 페이지의 제목 옆에 표시한다. */
export function DashboardPageToolbar({
  showPeriod = false,
}: {
  showPeriod?: boolean;
}) {
  const todayIso = useContext(FilterToday);
  if (!showPeriod || !todayIso) return null;
  return <PeriodFilters todayIso={todayIso} />;
}

export function useDashboardPageRefresh(
  refresh: () => void,
  refreshing: boolean,
  feedback?: RefreshFeedback,
) {
  const register = useContext(RegisterRefresh);
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  }, [refresh]);
  const paused = feedback?.paused;
  const updatedAt = feedback?.updatedAt;
  const partial = feedback?.partial;
  useEffect(() => {
    register?.({
      refresh: () => latest.current(),
      refreshing,
      feedback:
        paused === undefined
          ? undefined
          : { paused, updatedAt: updatedAt ?? 0, partial },
    });
    return () => register?.(null);
  }, [register, refreshing, paused, updatedAt, partial]);
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
