"use client";

import { PageContainer } from "@/components/layout/PageContainer";
import type { Overview } from "@/lib/api/overview";
import type { OverviewSettings } from "@/lib/api/overview-vendors";
import { presentOverview } from "@/lib/metrics/overview-presentation";
import { EmptyState } from "@/components/ui/EmptyState";
import { KpiCard } from "./KpiCard";
import { ModelMixCard } from "./ModelMixCard";
import { OverviewEmptyState } from "./OverviewEmptyState";
import { TeamUsageTable } from "./TeamUsageTable";
import { UsageValueCard } from "./UsageValueCard";
import { VendorSeatsCard } from "./VendorSeatsCard";

/** 기존 개요 배치와 컴포넌트를 유지하고 API 응답을 표시 모델로 변환한다. */
export function OverviewData({ data, settings, contractsMessage, retryContracts }: { data: Overview; settings?: OverviewSettings; contractsMessage?: string; retryContracts?: () => void }) {
  const model = presentOverview(data, settings);
  return <>
    <PageContainer className="flex items-start gap-4 pt-5 pb-10">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3"><div className="flex items-baseline gap-2.5">
          <h1 className="text-[18px] font-semibold tracking-[-0.01em]">개요</h1>
          <span role="status" className="text-[12px] text-text3">조직 전체 · {model.periodLabel}</span>
        </div></div>
        {model.isEmpty ? <OverviewEmptyState model={model} /> : !model.hasData ? <EmptyState message="선택한 기간에 데이터가 없습니다" description="다른 기간을 선택해 주세요." /> : null}
        {model.observation.coverageNote && <p className="text-xs text-orange-ink">{model.observation.coverageNote}</p>}
        <div className="grid grid-cols-5 gap-4 @max-[1023px]:grid-cols-2 @max-[560px]:grid-cols-1">
          {model.hasData && model.kpis.map((kpi) => <KpiCard key={kpi.label} {...kpi} compareLabel={model.compareLabel} noDeltaReason={model.noDeltaReason} staleAt={model.ingest.isDown && kpi.label !== "월 좌석 계약액" ? model.ingest.lastIngestAt : undefined} />)}
          {model.hasData && <><UsageValueCard key={`chart-${model.periodLabel}`} model={model} /><ModelMixCard key={`mix-${model.periodLabel}`} model={model} /></>}
          <VendorSeatsCard model={model.vendorOverview} message={contractsMessage} onRetry={retryContracts} />
          {model.attribution.show && <TeamUsageTable model={model} />}
        </div>
      </div>
    </PageContainer>
  </>;
}
