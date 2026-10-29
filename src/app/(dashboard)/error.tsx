"use client";

import { PageContainer } from "@/components/layout/PageContainer";
import { RenderErrorState } from "@/components/ui/RenderErrorState";

/** 본문의 예외만 대체하고 공통 레이아웃은 유지합니다. */
export default function DashboardError({ retry }: { retry: () => void }) {
  return (
    <PageContainer className="py-6">
      <RenderErrorState retry={retry} />
    </PageContainer>
  );
}
