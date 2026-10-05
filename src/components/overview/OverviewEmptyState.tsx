"use client";

import { ButtonLink } from "@/components/ui/Button";
import { useFilters, useDashboardHref } from "@/lib/filters";
import { FIRST_COLLECTION_STEPS, INVITE_DEEP_LINK, waitingText } from "@/lib/first-collection";

/**
 * 신호가 한 번도 들어온 적 없는 조직.
 * KPI 를 0 으로 채우지 않고 첫 수집 안내로 통째로 대체합니다 —
 * 0 은 "안 썼다"는 뜻이지 "아직 모른다"는 뜻이 아니기 때문입니다.
 * 주 행동은 구성원 초대입니다. 설치 명령은 초대 메일이 구성원마다 담아 보내므로 이 화면에서 복사할 명령을 보이지 않습니다.
 */
export function OverviewEmptyState() {
  const dashboardHref = useDashboardHref();
  const { autoRefresh } = useFilters();
  return (
    <div className="flex max-w-[760px] flex-col gap-5 rounded-lg border border-border bg-card p-[22px]">
      <div className="flex flex-col gap-[5px]">
        <span className="text-[15px] font-semibold">
          아직 수집된 신호가 없습니다
        </span>
        <span className="pretty text-[12.5px] text-text2">
          구성원이 CLI를 설치한 시점부터 사용량이 쌓입니다 · 설치 이전 기간은 조회할 수 없습니다
        </span>
      </div>

      <ol aria-label="첫 수집 단계" className="flex flex-col gap-0.5">
        {FIRST_COLLECTION_STEPS.map((step, index) => (
          <li
            key={step.n}
            className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-3 border-t border-border py-3"
          >
            <span
              className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
              style={index === 0 ? { background: "var(--text)", color: "var(--card)" } : { background: "var(--sub)", color: "var(--text2)" }}
            >
              {step.n}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[12.5px] font-semibold">{step.title}</span>
              <span className="pretty text-[11.5px] text-text2">{step.note}</span>
            </div>
            <span
              className="text-[11.5px] font-semibold whitespace-nowrap"
              style={{ color: index === 0 ? "var(--blue)" : "var(--text3)" }}
            >
              {step.state}
            </span>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2.5 border-t border-border pt-4">
        <span
          aria-hidden="true"
          className="h-[13px] w-[13px] shrink-0 rounded-full border-2 border-text3 border-t-transparent"
          style={autoRefresh ? { animation: "spin .8s linear infinite" } : undefined}
        />
        <span className="pretty min-w-0 flex-1 text-[12px] text-text2">{waitingText(autoRefresh)}</span>
        <ButtonLink href={dashboardHref(INVITE_DEEP_LINK)} variant="primary" className="h-8 px-[13px]">
          구성원 초대
        </ButtonLink>
      </div>
    </div>
  );
}
