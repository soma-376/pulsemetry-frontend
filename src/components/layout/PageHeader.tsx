import type { ReactNode } from "react";
import { DashboardPageToolbar } from "./DashboardHeader";

const PAGES = {
  overview: { title: "개요" },
  teams: { title: "팀 분석" },
  members: { title: "구성원" },
  ops: { title: "성과" },
  security: { title: "보안" },
  settings: { title: "설정" },
} as const;

/** 모든 페이지와 조회 상태에서 동일한 제목·작업 배치를 유지한다. */
export function PageHeader({
  page,
  actions,
}: {
  page: keyof typeof PAGES;
  actions?: ReactNode;
}) {
  const { title } = PAGES[page];
  return (
    <header
      aria-label={`${title} 페이지 헤더`}
      className="flex min-h-[30px] min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-3"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-3">
        <h1 className="shrink-0 text-[22px] leading-7 font-semibold tracking-[-0.02em]">
          {title}
        </h1>
        <DashboardPageToolbar
          showPeriod={page === "overview" || page === "teams" || page === "ops"}
        />
      </div>
      {actions && (
        <div className="flex min-h-7 max-w-full flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  );
}
