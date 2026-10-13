"use client";

import { PageHeader } from "@/components/layout/PageHeader";

import { PageContainer } from "@/components/layout/PageContainer";
import type { Overview } from "@/lib/api/overview";
import { presentOverview } from "@/lib/metrics/overview-presentation";
import { PeriodEmptyState } from "@/components/ui/PeriodEmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { KpiCard } from "./KpiCard";
import { ModelMixCard } from "./ModelMixCard";
import { OverviewEmptyState } from "./OverviewEmptyState";
import { TeamUsageTable } from "./TeamUsageTable";
import { UsageValueCard } from "./UsageValueCard";

/** 기존 개요 배치와 컴포넌트를 유지하고 API 응답을 표시 모델로 변환한다. */
export function OverviewData({ data }: { data: Overview }) {
  const model = presentOverview(data);
  return (
    <>
      <PageContainer className="flex items-start gap-4 pt-6 pb-10">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <PageHeader page="overview" />
          {model.isEmpty ? (
            <OverviewEmptyState />
          ) : !model.hasData ? (
            <PeriodEmptyState />
          ) : null}
          {model.hasData && (
            <div className="grid grid-cols-5 gap-4 @max-[1023px]:grid-cols-2 @max-[560px]:grid-cols-1">
              {!data.summary && (
                <div className="col-span-full">
                  <ErrorState message="요약 지표를 불러오지 못했습니다" />
                </div>
              )}
              {model.kpis.map((kpi) => (
                <KpiCard
                  key={kpi.label}
                  {...kpi}
                  compareLabel={model.compareLabel}
                />
              ))}
              {data.trend ? (
                <UsageValueCard
                  key={`chart-${model.periodLabel}`}
                  model={model}
                />
              ) : (
                <div className="col-span-3 @max-[1023px]:col-span-2 @max-[560px]:col-span-1">
                  <ErrorState message="사용 추이를 불러오지 못했습니다" />
                </div>
              )}
              {data.modelMix ? (
                <ModelMixCard key={`mix-${model.periodLabel}`} model={model} />
              ) : (
                <div className="col-span-2 @max-[560px]:col-span-1">
                  <ErrorState message="모델별 사용량을 불러오지 못했습니다" />
                </div>
              )}
              {!data.teamUsage && (
                <div className="col-span-full">
                  <ErrorState message="팀별 요약을 불러오지 못했습니다" />
                </div>
              )}
              {model.attribution.show && <TeamUsageTable model={model} />}
            </div>
          )}
        </div>
      </PageContainer>
    </>
  );
}
