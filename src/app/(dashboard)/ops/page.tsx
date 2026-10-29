import type { Metadata } from "next";
import { PerformanceContent } from "@/components/performance/PerformanceContent";

export const metadata: Metadata = {
  title: "성과 · Pulsemetry",
};

export default function Page() {
  return <PerformanceContent />;
}
