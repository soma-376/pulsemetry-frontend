import type { ReactNode } from "react";
import {
  Skeleton,
  SkeletonRegion,
  SkeletonRows,
} from "@/components/ui/Skeleton";
import { OverviewSkeleton } from "@/components/overview/OverviewSkeleton";
import { TeamsSkeleton } from "@/components/teams/TeamsSkeleton";
import { MembersSkeleton } from "@/components/members/MembersSkeleton";
import { SettingsSkeleton } from "@/components/settings/SettingsSkeleton";
import { PerformanceSkeleton } from "@/components/performance/PerformanceSkeleton";

/** 최초 확인·계정 전환에는 사용자 데이터 없이 기존 페이지 스켈레톤만 표시한다. */
export function SessionSkeleton({ path }: { path: string }) {
  const root = path.split("/")[1];
  const pages: Record<string, { title: string; body: ReactNode }> = {
    overview: { title: "개요", body: <OverviewSkeleton /> },
    teams: { title: "팀 분석", body: <TeamsSkeleton /> },
    members: { title: "구성원", body: <MembersSkeleton /> },
    settings: { title: "설정", body: <SettingsSkeleton /> },
    ops: { title: "성과", body: <PerformanceSkeleton /> },
  };
  const page = pages[root];
  return (
    <div className="min-h-dvh w-full bg-bg p-6 text-text @container">
      {page ? (
        <>
          <h1 className="mb-6 text-[22px] font-semibold">{page.title}</h1>
          {page.body}
        </>
      ) : (
        <SkeletonRegion
          message="화면을 불러오는 중입니다…"
          className="mx-auto max-w-xl"
        >
          <Skeleton className="mb-6 h-7 w-40" />
          <SkeletonRows />
        </SkeletonRegion>
      )}
    </div>
  );
}
