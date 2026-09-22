import type { Metadata } from "next";
import { TeamsContent } from "@/components/teams/TeamsContent";

export const metadata: Metadata = {
  title: "팀 분석 · Pulsemetry",
};

export default function TeamsPage() {
  return <TeamsContent />;
}
