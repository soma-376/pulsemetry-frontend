"use client";

import { useMemo } from "react";
import { CoverageBar } from "@/components/layout/CoverageBar";
import { FilterToolbar } from "@/components/layout/FilterToolbar";
import { IngestDownBanner } from "@/components/layout/IngestDownBanner";
import { KpiCard } from "@/components/overview/KpiCard";
import { ModelMixCard } from "@/components/overview/ModelMixCard";
import { OverviewEmptyState } from "@/components/overview/OverviewEmptyState";
import { TeamUsageTable } from "@/components/overview/TeamUsageTable";
import { UsageValueCard } from "@/components/overview/UsageValueCard";
import { VendorSeatsCard } from "@/components/overview/VendorSeatsCard";
import { useFilters } from "@/lib/filters";
import { buildOverview } from "@/lib/metrics/overview";
import { useOrganization } from "@/lib/organization-store";
import { buildVendorRows } from "@/lib/settings";

/**
 * P1 개요.
 * 전역 필터(비교 기준)를 구독해야 하므로 클라이언트 컴포넌트입니다.
 * 계산은 전부 buildOverview 안에 있고 여기서는 배치만 합니다.
 */
export function OverviewContent() {
  const { compare, dates } = useFilters();
  const { state } = useOrganization();
  const model = useMemo(() => buildOverview(compare, dates, state.teams, buildVendorRows(state.vendorEdits, state.addedVendors), state.seatReviewDays), [compare, dates, state.teams, state.vendorEdits, state.addedVendors, state.seatReviewDays]);

  return (
    <>
      <FilterToolbar />

      {model.ingest.isDown && (
        <IngestDownBanner
          title={model.ingest.down.title}
          detail={model.ingest.down.detail}
        />
      )}

      <CoverageBar
        dotColor={model.ingest.dot}
        installs={model.ingest.liveInstalls}
        members={model.ingest.liveMembers}
        coverage={model.ingest.liveCoverage}
        ingestText={model.ingest.text}
        ingestColor={model.ingest.fg}
        coverageNote={model.observation.coverageNote}
      />

      <div className="mx-auto flex w-full max-w-[1440px] items-start gap-4 px-6 pt-5 pb-10">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="flex items-baseline gap-2.5">
              <h1 className="text-[18px] font-semibold tracking-[-0.01em]">
                개요
              </h1>
              <span role="status" className="text-[12px] text-text3">
                조직 전체 · {model.periodLabel}
              </span>
            </div>
          </div>

          {model.isEmpty ? (
            <OverviewEmptyState model={model} />
          ) : !model.hasData ? (
            <div role="status" className="rounded-lg border border-border bg-card p-8 text-center">
              <p className="font-semibold">선택한 기간에 데이터가 없습니다</p>
              <p className="mt-2 text-text3">다른 기간을 선택해 주세요.</p>
            </div>
          ) : null}
            <div className="grid grid-cols-5 gap-4 @max-[1023px]:grid-cols-2 @max-[560px]:grid-cols-1">
              {model.hasData && model.kpis.map((k) => (
                <KpiCard
                  key={k.label}
                  {...k}
                  compareLabel={model.compareLabel}
                  noDeltaReason={model.noDeltaReason}
                  staleAt={
                    model.ingest.isDown && k.label !== "월 좌석 계약액" ? model.ingest.lastIngestAt : undefined
                  }
                />
              ))}

              {model.hasData && <>
              <UsageValueCard key={`chart-${model.periodLabel}`} model={model} />
              <ModelMixCard key={`mix-${model.periodLabel}`} model={model} />
              </>}
              <VendorSeatsCard model={model.vendorOverview} />
              {model.attribution.show && <TeamUsageTable model={model} />}
            </div>
        </div>
      </div>
    </>
  );
}
