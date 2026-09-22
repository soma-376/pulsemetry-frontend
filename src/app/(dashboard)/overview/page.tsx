import type { Metadata } from "next";
import { OverviewContent } from "@/components/overview/OverviewContent";

export const metadata: Metadata = {
  title: "개요 · Pulsemetry",
};

export default function OverviewPage() {
  return <OverviewContent />;
}
