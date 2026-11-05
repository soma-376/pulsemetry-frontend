"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import {
  INGEST_STATES,
  ingestDetails,
  type IngestStatus,
} from "@/lib/api/ingest-status";
import { ManagementError } from "@/lib/api/management";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { TransmissionLossPopover } from "./TransmissionLossPopover";

export function IngestStatusBar({
  query,
  enabled,
}: {
  query: UseQueryResult<IngestStatus, Error>;
  enabled: boolean;
}) {
  const denied =
    query.error instanceof ManagementError &&
    [401, 403, 404].includes(query.error.status);
  const data = denied ? undefined : query.data;
  return (
    <div
      aria-label="조직 수집 현황"
      className="flex min-h-12 min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text2"
    >
      {!enabled ? (
        <span>로그인 후 전송 손실을 확인할 수 있습니다</span>
      ) : !data && query.isPending ? (
        <LoadingState
          variant="inline"
          message={
            query.isPaused ? "연결을 기다리는 중입니다…" : "전송 손실 확인 중…"
          }
        />
      ) : !data && query.error ? (
        <ErrorState
          variant="inline"
          className="min-w-0 flex-1"
          retrying={query.isFetching}
          message={
            denied ? query.error.message : "전송 손실을 불러오지 못했습니다."
          }
          onRetry={() => void query.refetch({ cancelRefetch: false })}
        ></ErrorState>
      ) : data ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full"
              style={{
                background:
                  data.reason === "installations_silent"
                    ? "var(--text3)"
                    : INGEST_STATES[data.status].color,
              }}
            />
            <strong className="font-medium">
              {data.reason === "installations_silent"
                ? "보고 상태 미확인"
                : INGEST_STATES[data.status].label}
            </strong>
            <span className="text-text3">
              ·{" "}
              {ingestDetails(data, true)
                .find((detail) => detail.startsWith("마지막 수신"))
                ?.replace("마지막 수신 ", "마지막 수신: ") ??
                "마지막 수신: 기록 없음"}
            </span>
            {query.isError && (
              <span className="text-orange-ink">갱신 실패</span>
            )}
          </div>
          <span
            aria-hidden="true"
            className="hidden h-3.5 w-px bg-border sm:block"
          />
          <TransmissionLossPopover
            data={data}
            refreshFailed={query.isError}
            refreshingSummary={query.isFetching}
            onRefreshSummary={() =>
              void query.refetch({ cancelRefetch: false })
            }
          />
        </>
      ) : null}
    </div>
  );
}
