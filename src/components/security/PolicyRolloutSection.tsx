"use client";

import Link from "next/link";
import type { UseQueryResult } from "@tanstack/react-query";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import type { Settings } from "@/lib/api/settings";
import { int } from "@/lib/format";

type Rollout = Settings["policyRollout"];

const COLUMNS =
  "grid grid-cols-[minmax(0,1fr)] gap-3 @3xl:grid-cols-[minmax(0,1fr)_96px_minmax(0,1.4fr)_96px_96px]";

/** 적용 비율. 활성 설치가 없으면 비율을 만들지 않는다(0%로 읽히게 하지 않는다). */
export const rolloutRatio = (rollout: Rollout) =>
  rollout.eligibleInstallations > 0
    ? rollout.appliedInstallations / rollout.eligibleInstallations
    : null;

/**
 * 정책 적용 현황(서버 ADR 0043) — 설정 응답의 policyRollout. 벤더별 판정은 서버에 없어 활성 설치 전체 한 줄로 보인다.
 * 판정 근거(설치 보고·적용 확인 기록·없음)는 서버가 실은 경우에만 말한다.
 */
export function PolicyRolloutSection({
  query,
  denied,
}: {
  query: UseQueryResult<Settings>;
  denied: boolean;
}) {
  const rollout = denied ? undefined : query.data?.policyRollout;
  const ratio = rollout ? rolloutRatio(rollout) : null;
  return (
    <section
      aria-label="정책 적용"
      className="@container min-w-0 rounded-lg border border-border bg-card p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2
          title="설치가 지금 집행하는 수집 정책 판 · 마지막 설치 보고, 없으면 적용 확인 기록 기준"
          className="text-sm font-semibold"
        >
          정책 적용
        </h2>
        {rollout && (
          <Link
            href="/settings"
            className="text-xs font-medium whitespace-nowrap"
          >
            설정에서 업데이트 안내 →
          </Link>
        )}
      </div>

      {denied && (
        <p className="py-6 text-center text-xs text-text2">
          정책 적용 현황을 볼 권한이 없습니다.
        </p>
      )}
      {!denied && !query.data && query.isPending && <SkeletonRows rows={1} />}
      {!denied && query.error && !query.data && (
        <ErrorState
          variant="inline"
          message={query.error.message}
          retrying={query.isFetching}
          onRetry={() => void query.refetch({ cancelRefetch: false })}
        />
      )}

      {rollout && (
        <>
          <div
            aria-hidden="true"
            className={`${COLUMNS} border-b border-border px-1 pb-2 text-[11px] text-text3`}
          >
            <span>대상</span>
            <span className="hidden text-right @3xl:block">활성 설치</span>
            <span className="hidden @3xl:block">
              최신 정책 v{rollout.desiredVersion}
            </span>
            <span className="hidden text-right @3xl:block">구버전</span>
            <span className="hidden text-right @3xl:block">확인 불가</span>
          </div>
          <div
            role="group"
            aria-label="전체 설치 정책 적용"
            className={`${COLUMNS} tnum items-center border-b border-border px-1 py-3`}
          >
            <span className="flex min-w-0 flex-col gap-px">
              <span className="text-[13px] font-semibold">전체 설치</span>
              <span className="text-[11px] text-text3 @3xl:hidden">
                활성 {int(rollout.eligibleInstallations)}대 · 구버전{" "}
                {int(rollout.outdatedInstallations)}대 · 확인 불가{" "}
                {int(rollout.unknownInstallations)}대
              </span>
            </span>
            <span className="hidden text-right text-xs text-text2 @3xl:block">
              {int(rollout.eligibleInstallations)}대
            </span>
            <div className="flex min-w-0 items-center gap-2">
              <span className="relative h-2 flex-1 overflow-hidden rounded-sm bg-sub">
                {ratio !== null && (
                  <span
                    className={`absolute inset-y-0 left-0 rounded-sm ${ratio < 0.85 ? "bg-orange-ink" : "bg-blue"}`}
                    style={{ width: `${(ratio * 100).toFixed(1)}%` }}
                  />
                )}
              </span>
              <span className="w-[84px] text-right text-xs font-semibold whitespace-nowrap">
                {ratio === null
                  ? "-"
                  : `${int(rollout.appliedInstallations)} · ${Math.round(ratio * 100)}%`}
              </span>
            </div>
            <span
              className={`hidden text-right text-xs @3xl:block ${rollout.outdatedInstallations ? "text-orange-ink" : "text-text3"}`}
            >
              {int(rollout.outdatedInstallations)}대
            </span>
            <span
              className={`hidden text-right text-xs @3xl:block ${rollout.unknownInstallations ? "text-orange-ink" : "text-text3"}`}
            >
              {int(rollout.unknownInstallations)}대
            </span>
          </div>
          {rollout.evidence && (
            <p className="mt-2.5 px-1 text-[11px] text-text3">
              판정 근거 · 설치 보고 {int(rollout.evidence.heartbeat)}대 · 적용
              확인 기록 {int(rollout.evidence.appliedConfirmation)}대 · 근거
              없음 {int(rollout.evidence.none)}대
            </p>
          )}
        </>
      )}
    </section>
  );
}
