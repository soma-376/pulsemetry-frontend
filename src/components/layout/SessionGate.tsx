"use client";

import type { ReactNode } from "react";
import { PageContainer } from "./PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import { useBackendSession } from "@/lib/api/session";
import { useHydrated } from "@/lib/use-hydrated";

/**
 * 대시보드의 보호 경로 처리 하나. 세션이 없으면(처음 들어왔거나, 로그아웃했거나, 갱신이 실패해 세션이 지워졌으면) 어느 화면이든
 * 같은 로그인 안내를 보이고 조직 데이터를 조회하지 않는다. 세션은 브라우저 저장소에서 읽으므로 서버 렌더·첫 hydration 에는 아무것도 그리지 않는다.
 * 화면 이동마다 현재 사용자 조회를 부르지 않는다 — 권한(403)은 각 화면의 조회가 서버 응답대로 안내한다.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const session = useBackendSession();
  if (!hydrated) return null;
  if (!session) return <PageContainer className="flex flex-col gap-6 pt-10 pb-10">
    <h1 className="text-[18px] font-semibold tracking-[-0.01em]">로그인이 필요합니다</h1>
    <EmptyState message="로그인한 세션이 없거나 만료되었습니다."
      description="조직 관리자 계정으로 로그인하면 이 화면을 볼 수 있습니다."
      action={<ButtonLink href="/login" variant="primary">로그인</ButtonLink>} />
  </PageContainer>;
  return children;
}
