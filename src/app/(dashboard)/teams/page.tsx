import type { Metadata } from "next";
import { TeamsContent } from "@/components/teams/TeamsContent";

export const metadata: Metadata = {
  title: "팀 분석 · Pulsemetry",
};

export default async function TeamsPage({ searchParams }: { searchParams: Promise<{ team?: string | string[] }> }) {
  const { team } = await searchParams;
  const initialTeamId = typeof team === "string" ? team : undefined;
  return <TeamsContent key={initialTeamId ?? "all"} initialTeamId={initialTeamId} />;
}
