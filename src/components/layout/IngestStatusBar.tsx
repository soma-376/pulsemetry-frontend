"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { useState } from "react";
import {
  transmissionLossLabel,
  type IngestStatus,
} from "@/lib/api/ingest-status";
import { ManagementError } from "@/lib/api/management";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { lossTime, TransmissionLossDrawer } from "./TransmissionLossDrawer";

export function IngestStatusBar({
  query,
  enabled,
}: {
  query: UseQueryResult<IngestStatus, Error>;
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const denied =
    query.error instanceof ManagementError &&
    [401, 403, 404].includes(query.error.status);
  const data = denied ? undefined : query.data;
  const loss = data?.transmissionLoss;
  return (
    <div
      aria-label="조직 수집 현황"
      className="flex min-h-12 min-w-0 flex-1 items-center gap-2 text-xs text-text2"
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
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open}
            className="min-w-0 cursor-pointer rounded border border-border px-2 py-1 text-left leading-5 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 [overflow-wrap:anywhere]"
            onClick={() => setOpen(true)}
            title={`${lossTime(loss?.windowEnd ?? data.asOf)} 기준`}
          >
            <span
              className={
                loss?.availability === "partial"
                  ? "font-medium text-orange-ink"
                  : "font-medium"
              }
            >
              {transmissionLossLabel(loss)}
            </span>
            {loss?.availability === "partial" && loss.availableFrom && (
              <span className="block text-[11px] text-text3">
                집계 시작 {lossTime(loss.availableFrom)}
              </span>
            )}
            <span
              className={`block text-[11px] leading-4 ${query.isError ? "text-orange-ink" : "text-text3"}`}
            >
              {query.isError ? "갱신 실패 · " : ""}
              {lossTime(loss?.windowEnd ?? data.asOf)} 기준
            </span>
          </button>
          <TransmissionLossDrawer
            data={data}
            open={open}
            onClose={() => setOpen(false)}
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
