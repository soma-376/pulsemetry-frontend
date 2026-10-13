"use client";

import { Button } from "./Button";
import { Icon } from "./Icon";

export type RefreshFeedback = {
  paused: boolean;
  updatedAt: number;
  partial?: boolean;
};

/** 재조회가 실패한 캐시만 안내한다. 최초 실패와 접근 제한은 호출 화면이 처리한다. */
export function refreshFeedback(
  ...queries: {
    data: unknown;
    error: unknown;
    isPaused: boolean;
    dataUpdatedAt: number;
  }[]
): RefreshFeedback | undefined {
  const stale = queries.filter(
    (query) => query.data !== undefined && (query.error || query.isPaused),
  );
  if (!stale.length) return undefined;
  return {
    paused: stale.some((query) => query.isPaused),
    updatedAt: Math.min(...stale.map((query) => query.dataUpdatedAt)),
  };
}

/** 본문의 위치를 바꾸지 않으며, 성공적으로 다시 조회할 때까지 유지한다. */
export function RefreshNotice({
  feedback,
  retrying,
  onRetry,
}: {
  feedback?: RefreshFeedback;
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed right-4 bottom-24 left-4 z-40 flex justify-end sm:left-auto sm:w-[360px]"
    >
      {feedback && (
        <div
          role="status"
          aria-label="데이터 갱신 상태"
          className="pointer-events-auto flex w-full items-start gap-3 rounded-lg border border-border bg-card p-3 text-xs shadow-lg"
        >
          <Icon
            name="alert"
            size={16}
            className="mt-0.5 shrink-0 text-orange-ink"
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-text">
              {feedback.paused
                ? "연결을 기다리고 있습니다"
                : feedback.partial
                  ? "일부 데이터를 불러오지 못했습니다"
                  : "데이터를 갱신하지 못했습니다"}
            </p>
            <p className="mt-1 text-text2">
              {feedback.partial
                ? "조회에 성공한 영역을 표시합니다."
                : "마지막으로 조회한 데이터를 표시합니다."}
            </p>
            {feedback.updatedAt > 0 && (
              <p className="mt-1 text-text3">
                마지막 조회 ·{" "}
                {new Date(feedback.updatedAt).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}
              </p>
            )}
          </div>
          <Button
            size="sm"
            onClick={onRetry}
            disabled={feedback.paused}
            loading={retrying}
            loadingLabel="조회 중…"
          >
            다시 조회
          </Button>
        </div>
      )}
    </div>
  );
}
