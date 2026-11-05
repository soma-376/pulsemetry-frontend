"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import {
  INGEST_STATES,
  ingestDetails,
  lossInstallationsOptions,
  transmissionLossLabel,
  transmissionLossReasonText,
  type IngestStatus,
} from "@/lib/api/ingest-status";
import { ManagementError } from "@/lib/api/management";
import { DetailDrawer } from "@/components/ui/DetailDrawer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { int } from "@/lib/format";

export const lossTime = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : "-";

export function TransmissionLossDrawer({
  data,
  open,
  onClose,
  refreshFailed,
  refreshingSummary,
  onRefreshSummary,
}: {
  data: IngestStatus;
  open: boolean;
  onClose: () => void;
  refreshFailed: boolean;
  refreshingSummary: boolean;
  onRefreshSummary: () => void;
}) {
  const loss = data.transmissionLoss;
  const canRead = !!loss && loss.availability !== "unavailable";
  const query = useInfiniteQuery({
    ...lossInstallationsOptions(data.organizationId, loss?.windowEnd ?? ""),
    enabled: open && canRead,
  });
  const denied =
    query.error instanceof ManagementError &&
    [401, 403, 404].includes(query.error.status);
  const expired =
    query.error instanceof ManagementError &&
    query.error.code === "snapshot_expired";
  const pages = denied ? [] : (query.data?.pages ?? []);
  const first = pages[0];
  const items = pages.flatMap((page) => page.installations.items);
  const status =
    data.reason === "installations_silent"
      ? "보고 상태 미확인"
      : INGEST_STATES[data.status].label;
  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      title="전송 손실 상세"
      subtitle={`${lossTime(loss?.windowEnd ?? data.asOf)} 기준`}
    >
      <div className="flex flex-col gap-5 text-xs">
        <section aria-label="전송 손실 집계" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">
            {transmissionLossLabel(loss)}
          </h3>
          <p className="leading-5 text-text2">
            데몬이 보고한 손실 페이로드 수입니다. 이벤트·토큰 수와 다르며, 전송
            대기·정책상 비수집·단순 보고 공백은 포함하지 않습니다.
          </p>
          {refreshFailed && (
            <p role="status" className="text-orange-ink">
              갱신 실패 · 마지막으로 확인한 집계를 표시합니다.
            </p>
          )}
          {loss && (
            <>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 break-words">
                <dt className="text-text3">집계 구간</dt>
                <dd>
                  {lossTime(loss.windowStart)} 이상 ~ {lossTime(loss.windowEnd)}{" "}
                  미만
                </dd>
                <dt className="text-text3">집계 가능 시작</dt>
                <dd>{lossTime(loss.availableFrom)}</dd>
                <dt className="text-text3">영향 기기</dt>
                <dd>
                  {loss.affectedInstallationCount === null
                    ? "-"
                    : `${int(loss.affectedInstallationCount)}대`}
                </dd>
              </dl>
              {loss.reasons.length > 0 && (
                <ul
                  aria-label="집계 제한"
                  className="list-disc space-y-1 pl-4 text-orange-ink"
                >
                  {loss.reasons.map((reason) => (
                    <li key={reason}>{transmissionLossReasonText(reason)}</li>
                  ))}
                </ul>
              )}
              <p className="text-text3">
                보고된 증가분의 집계입니다. 집계가 완료되어도 실제 모든 전송의
                무손실을 보장하지 않습니다.
              </p>
            </>
          )}
        </section>
        <section
          aria-label="현재 전송 상태"
          className="border-t border-border pt-4"
        >
          <h3 className="mb-2 font-semibold">현재 전송 상태</h3>
          <p>{status}</p>
          {ingestDetails(data).map((detail) => (
            <p key={detail} className="mt-1 text-text2">
              {detail}
            </p>
          ))}
        </section>
        {canRead && (
          <section
            aria-label="손실 영향 기기"
            className="border-t border-border pt-4"
          >
            <h3 className="mb-3 font-semibold">손실 영향 기기</h3>
            {!first && query.isPending && (
              <LoadingState
                variant="inline"
                message={
                  query.isPaused
                    ? "연결을 기다리는 중입니다…"
                    : "영향 기기를 불러오는 중입니다…"
                }
              />
            )}
            {query.error && (
              <ErrorState
                variant={expired ? "panel" : "inline"}
                message={
                  expired
                    ? "집계 기준이 만료되었습니다. 최신 집계를 다시 조회하세요."
                    : first
                      ? "영향 기기 갱신에 실패했습니다. 이전 목록을 표시합니다."
                      : "영향 기기를 불러오지 못했습니다."
                }
                description={expired ? undefined : query.error.message}
                retrying={expired ? refreshingSummary : query.isFetching}
                retryLabel={expired ? "최신 집계 조회" : "다시 조회"}
                onRetry={
                  expired
                    ? onRefreshSummary
                    : () => void query.refetch({ cancelRefetch: false })
                }
              />
            )}
            {first && items.length === 0 && (
              <EmptyState message="보고된 전송 손실이 있는 기기가 없습니다" />
            )}
            {items.length > 0 && (
              <ul className="flex flex-col gap-2">
                {items.map((installation) => (
                  <li
                    key={installation.installationId}
                    className="rounded-lg border border-border p-3 [overflow-wrap:anywhere]"
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <strong>
                        {installation.deviceName ?? installation.installationId}
                      </strong>
                      <span>
                        {int(installation.payloadCount)}건 ·{" "}
                        {installation.status === "revoked" ? "폐기" : "활성"}
                      </span>
                    </div>
                    <p className="mt-1 text-text2">
                      {installation.account ??
                        installation.memberId ??
                        "구성원 정보 없음"}
                    </p>
                    <p className="mt-1 text-text3">
                      마지막 증가분 확인 {lossTime(installation.lastObservedAt)}
                    </p>
                    <p className="mt-1 text-text3">
                      설치 ID {installation.installationId}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {query.hasNextPage && (
              <Button
                className="mt-3"
                size="sm"
                loading={query.isFetchingNextPage}
                loadingLabel="불러오는 중…"
                onClick={() => void query.fetchNextPage()}
              >
                더 보기
              </Button>
            )}
          </section>
        )}
      </div>
    </DetailDrawer>
  );
}
