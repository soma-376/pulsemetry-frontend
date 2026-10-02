import type { Metadata } from "next";
import { MembersContent } from "@/components/members/MembersContent";

export const metadata: Metadata = {
  title: "구성원 · Pulsemetry",
};

/** `?invite=1`은 초대 창을 바로 연다(개요의 빈 상태가 쓰는 딥링크 — 팀 화면의 `?team=` 과 같은 방식). */
export default async function MembersPage({ searchParams }: { searchParams: Promise<{ invite?: string | string[] }> }) {
  const { invite } = await searchParams;
  return <MembersContent initialInvite={invite === "1"} />;
}
