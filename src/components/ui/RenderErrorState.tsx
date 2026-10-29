"use client";

import { useTransition } from "react";
import { ErrorState } from "./ErrorState";

/** 루트 Provider가 실패해도 사용할 수 있는 렌더링 오류 UI. */
export function RenderErrorState({ retry }: { retry: () => void }) {
  const [retrying, startTransition] = useTransition();

  return (
    <ErrorState
      message={<h1>화면을 불러오지 못했습니다</h1>}
      description="일시적인 문제가 발생했습니다. 다시 시도해 주세요. 문제가 계속되면 잠시 후 다시 접속해 주세요."
      onRetry={() => startTransition(retry)}
      retrying={retrying}
      retryLabel="다시 시도"
    >
      {/* 라우터가 실패한 경우에도 새 문서로 이동할 수 있어야 합니다. */}
      <form action="/" method="get">
        <button
          type="submit"
          className="cursor-pointer text-text2 underline underline-offset-4"
        >
          처음으로
        </button>
      </form>
    </ErrorState>
  );
}
