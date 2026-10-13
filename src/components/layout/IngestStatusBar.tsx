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
  const detail = data ? ingestDetails(data).join(" · ") || null : null;
  const summary = data ? ingestDetails(data, true).join(" · ") : null;
  return (
    <div
      aria-label="조직 수집 현황"
      className="flex min-h-8 min-w-0 flex-1 items-center gap-2 text-xs text-text2"
    >
      {!enabled ? (
        <span>로그인 후 수집 상태를 확인할 수 있습니다</span>
      ) : !data && query.isPending ? (
        <LoadingState
          variant="inline"
          message={
            query.isPaused ? "연결을 기다리는 중입니다…" : "수집 상태 확인 중…"
          }
        />
      ) : !data && query.error ? (
        <ErrorState
          variant="inline"
          className="min-w-0 flex-1"
          retrying={query.isFetching}
          message={
            denied ? query.error.message : "수집 상태를 불러오지 못했습니다."
          }
          onRetry={() => void query.refetch({ cancelRefetch: false })}
        ></ErrorState>
      ) : data ? (
        <>
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: INGEST_STATES[data.status].color }}
          />
          <span
            role="status"
            className="min-w-0 leading-5 [overflow-wrap:anywhere]"
            title={detail ?? undefined}
          >
            <strong
              className="font-medium"
              style={{ color: INGEST_STATES[data.status].color }}
            >
              {INGEST_STATES[data.status].label}
            </strong>
            {summary && <span> · {summary}</span>}
          </span>
        </>
      ) : null}
    </div>
  );
}
