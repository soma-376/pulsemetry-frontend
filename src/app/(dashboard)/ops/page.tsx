import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";

export const metadata: Metadata = {
  title: "운영 · 보안 · Pulsemetry",
};

export default function Page() {
  return (
    <PagePlaceholder
      title="운영 · 보안"
      source="Pulsemetry P3 Ops.dc.html"
      note="이번 범위에 포함되지 않은 화면입니다. 세션 조회(사유 필수)와 보안 알림이 들어옵니다."
    />
  );
}
