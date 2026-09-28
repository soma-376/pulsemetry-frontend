"use client";

import type { Overview } from "@/lib/api/overview";
import type { OverviewSettings } from "@/lib/api/overview-vendors";
import { presentOverview } from "@/lib/metrics/overview-presentation";
import { CoverageBar } from "@/components/layout/CoverageBar";
import { IngestDownBanner } from "@/components/layout/IngestDownBanner";
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
    {model.ingest.isDown && <IngestDownBanner title={model.ingest.down.title} detail={model.ingest.down.detail} />}
    <CoverageBar dotColor={model.ingest.dot} installs={model.ingest.liveInstalls} members={model.ingest.liveMembers} coverage={model.ingest.liveCoverage} ingestText={model.ingest.text} ingestColor={model.ingest.fg} coverageNote={model.observation.coverageNote} />
    <div className="mx-auto flex w-full max-w-[1440px] items-start gap-4 px-6 pt-5 pb-10">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3"><div className="flex items-baseline gap-2.5">
          <h1 className="text-[18px] font-semibold tracking-[-0.01em]">개요</h1>
          <span role="status" className="text-[12px] text-text3">조직 전체 · {model.periodLabel}</span>
        </div></div>
        {model.isEmpty ? <OverviewEmptyState model={model} /> : !model.hasData ? <div role="status" className="rounded-lg border border-border bg-card p-8 text-center"><p className="font-semibold">선택한 기간에 데이터가 없습니다</p><p className="mt-2 text-text3">다른 기간을 선택해 주세요.</p></div> : null}
        <div className="grid grid-cols-5 gap-4 @max-[1023px]:grid-cols-2 @max-[560px]:grid-cols-1">
          {model.hasData && model.kpis.map((kpi) => <KpiCard key={kpi.label} {...kpi} compareLabel={model.compareLabel} noDeltaReason={model.noDeltaReason} staleAt={model.ingest.isDown && kpi.label !== "월 좌석 계약액" ? model.ingest.lastIngestAt : undefined} />)}
          {model.hasData && <><UsageValueCard key={`chart-${model.periodLabel}`} model={model} /><ModelMixCard key={`mix-${model.periodLabel}`} model={model} /></>}
          <VendorSeatsCard model={model.vendorOverview} message={contractsMessage} onRetry={retryContracts} />
          {model.attribution.show && <TeamUsageTable model={model} />}
        </div>
      </div>
    </div>
  </>;
}
