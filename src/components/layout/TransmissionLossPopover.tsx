"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  lossInstallationsOptions,
  transmissionLossLabel,
  transmissionLossReasonText,
  type IngestStatus,
} from "@/lib/api/ingest-status";
import { ManagementError } from "@/lib/api/management";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { int } from "@/lib/format";

const shortLossTime = (value: string) => {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value;
  return `${part("month")}/${part("day")} ${part("hour")}:${part("minute")}`;
};

export function TransmissionLossPopover({
  data,
  refreshFailed,
  refreshingSummary,
  onRefreshSummary,
}: {
  data: IngestStatus;
  refreshFailed: boolean;
  refreshingSummary: boolean;
  onRefreshSummary: () => void;
}) {
  const id = useId();
  const anchor = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 16, top: 0 });
  function positionPopover() {
    const element = popup.current;
    if (!element) return;
    if (element.matches(":popover-open")) return;
    const rect = anchor.current!.getBoundingClientRect();
    const width = Math.min(336, window.innerWidth - 32);
    setPosition({
      left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
      top: Math.max(16, Math.min(rect.bottom + 10, window.innerHeight - 160)),
    });
  }
  useEffect(() => {
    if (!open) return;
    const close = () => popup.current?.hidePopover();
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, [open]);
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
  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        popoverTarget={id}
        onClick={positionPopover}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded py-1 text-left text-xs text-text2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <span
          className={
            loss?.payloadCount || loss?.availability === "partial"
              ? "text-orange-ink"
              : ""
          }
        >
          {transmissionLossLabel(loss)}
        </span>
        <span aria-hidden="true" className={open ? "rotate-180" : ""}>
          ⌄
        </span>
      </button>
      <div
        id={id}
        ref={popup}
        popover="auto"
        role="dialog"
        aria-labelledby={`${id}-title`}
        onToggle={(event) => {
          const isOpen = event.newState === "open";
          setOpen(isOpen);
          // 마지막 페이지의 더 보기 버튼이 사라지면 포커스가 body로 이동한다.
          // 바깥의 다른 컨트롤을 클릭한 경우에는 그 포커스를 유지한다.
          if (
            !isOpen &&
            (document.activeElement === document.body ||
              popup.current?.contains(document.activeElement))
          ) {
            anchor.current?.focus();
          }
        }}
        style={{
          ...position,
          maxHeight: `calc(100dvh - ${position.top + 16}px)`,
        }}
        className="fixed inset-auto m-0 w-[min(336px,calc(100vw-32px))] overflow-y-auto rounded-xl border border-border bg-card px-5 py-[18px] text-xs text-text shadow-lg backdrop:bg-transparent"
      >
        <div className="flex items-center justify-between">
          <h3 id={`${id}-title`} className="text-sm font-semibold">
            전송 손실
          </h3>
          <button
            type="button"
            aria-label="전송 손실 닫기"
            className="cursor-pointer px-1 text-xl leading-5 text-text3"
            onClick={() => {
              popup.current?.hidePopover();
              anchor.current?.focus();
            }}
          >
            ×
          </button>
        </div>
        <section aria-label="전송 손실 집계">
          {loss && (
            <p className="mt-2 mb-[18px] text-[10px] text-text3">
              {shortLossTime(loss.windowStart)} –{" "}
              {shortLossTime(loss.windowEnd)} · 최근 7일
            </p>
          )}
          <div className="mt-3 flex items-baseline justify-between gap-2">
            <strong className="text-[28px] font-semibold tracking-tight">
              {loss?.payloadCount == null ? (
                "확인 불가"
              ) : (
                <>
                  {int(loss.payloadCount)}
                  <span className="ml-1 text-[13px] font-normal">건</span>
                </>
              )}
            </strong>
            {loss?.affectedInstallationCount != null && (
              <span className="text-[11px] text-text2">
                영향 기기 {int(loss.affectedInstallationCount)}대
              </span>
            )}
          </div>
          {refreshFailed && (
            <p role="status" className="text-orange-ink">
              갱신 실패 · 마지막으로 확인한 집계를 표시합니다.
            </p>
          )}
          {loss?.availability === "partial" && loss.availableFrom && (
            <p className="mt-3 text-[11px] text-orange-ink">
              {shortLossTime(loss.availableFrom)}부터 일부 집계
            </p>
          )}
          {!!loss?.reasons.length && (
            <ul
              aria-label="집계 제한"
              className="mt-3 space-y-1 text-[11px] text-text2"
            >
              {loss.reasons.map((reason) => (
                <li key={reason}>{transmissionLossReasonText(reason)}</li>
              ))}
            </ul>
          )}
        </section>
        {canRead && (
          <section
            aria-label="손실 영향 기기"
            className="mt-[17px] border-t border-border pt-3.5"
          >
            <h3 className="mb-2.5 text-[10px] text-text3">
              기기별 보고된 손실
            </h3>
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
                    className="py-1.5 text-[11px] [overflow-wrap:anywhere]"
                  >
                    <div className="flex justify-between gap-3">
                      <strong>
                        {installation.account
                          ? `${installation.account} · `
                          : ""}
                        {installation.deviceName ?? installation.installationId}
                      </strong>
                      <span>
                        {int(installation.payloadCount)}건
                        {installation.status === "revoked" ? " · 폐기" : ""}
                      </span>
                    </div>
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
    </>
  );
}
