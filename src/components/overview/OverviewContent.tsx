"use client";

import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilterToolbar } from "@/components/layout/FilterToolbar";
import { Button } from "@/components/ui/Button";
import { OverviewData } from "./OverviewData";
import { OverviewProviders } from "./OverviewProviders";
import { DashboardError, overviewQueryOptions } from "@/lib/api/overview";
import { overviewSettingsOptions } from "@/lib/api/overview-vendors";
import { useBackendSession } from "@/lib/api/session";
import { currentDateIso } from "@/lib/date";
import { useFilters } from "@/lib/filters";

const subscribe = () => () => {};
const serverDate = () => null;
export function OverviewContent() {
  const session = useBackendSession();
  const todayIso = useSyncExternalStore(subscribe, currentDateIso, serverDate);
  if (!todayIso) return <p role="status" className="p-6">개요를 준비하는 중입니다…</p>;
  return <OverviewProviders key={session?.user.organizationId ?? "anonymous"} todayIso={todayIso}><OverviewQuery todayIso={todayIso} /></OverviewProviders>;
}
function OverviewQuery({ todayIso }: { todayIso: string }) {
  const session = useBackendSession();
  const organizationId = session?.user.organizationId ?? process.env.NEXT_PUBLIC_ORGANIZATION_ID ?? "";
  const { compare, dates, autoRefresh } = useFilters();
  const configured = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(organizationId);
  const query = useQuery({
    ...overviewQueryOptions({ organizationId, startDate: dates.start, endDate: dates.end ?? dates.start, compare, timeZone: "Asia/Seoul" }),
    enabled: configured,
    refetchInterval: (state) => {
      const error = state.state.error;
      if (error instanceof DashboardError && error.status >= 400 && error.status < 500 && error.status !== 429) return false;
      return autoRefresh ? Math.max(300_000, error instanceof DashboardError ? error.retryAfterMs : 0) : false;
    },
  });
  // 현재 계약은 기간별 사용량과 독립적으로 조회한다. 한 요청의 실패가 다른 카드를 지우지 않는다.
  const contracts = useQuery({ ...overviewSettingsOptions(organizationId), enabled: configured, refetchInterval: autoRefresh ? 300_000 : false });
  const denied = query.error instanceof DashboardError && [401, 403, 404].includes(query.error.status);
  const contractsDenied = contracts.error instanceof DashboardError && [401, 403, 404].includes(contracts.error.status);
  const data = denied ? undefined : query.data;
  return <>
    <FilterToolbar todayIso={todayIso} onRefresh={() => { if (configured) void Promise.all([query.refetch(), contracts.refetch()]); }} refreshing={!configured || query.isFetching || contracts.isFetching} csvDisabled />
    {!data && <div className="mx-auto w-full max-w-[1440px] px-6 pt-5"><h1 className="text-[18px] font-semibold tracking-[-0.01em]">개요</h1></div>}
    {!configured ? <div role="status" className="m-6 rounded-lg border border-border bg-card p-8">조회할 조직이 설정되지 않았습니다. 관리자에게 문의해 주세요.</div> : <>
      {query.isPending && <p role="status" className="m-6 rounded-lg border border-border bg-card p-8">개요 데이터를 불러오는 중입니다…</p>}
      {query.error && <div role="alert" className="mx-6 mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
        <p>{query.error instanceof DashboardError ? query.error.message : "개요 데이터를 불러오지 못했습니다. 연결 상태를 확인해 주세요."}{data && " 마지막으로 조회한 데이터를 표시합니다."}</p>
        <Button onClick={() => void query.refetch()} disabled={query.isFetching}>다시 시도</Button>
      </div>}
      {data && <OverviewData key={[organizationId, dates.start, dates.end, compare].join(":")} data={data} settings={contractsDenied ? undefined : contracts.data} contractsMessage={contracts.error ? "계약 정보를 불러오지 못했습니다." : contracts.isPending ? "계약 정보를 불러오는 중입니다…" : undefined} retryContracts={contracts.error ? () => void contracts.refetch() : undefined} />}
    </>}
  </>;
}
