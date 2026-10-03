import type { Metadata } from "next";
import { OpsContent } from "@/components/ops/OpsContent";

export const metadata: Metadata = {
  title: "운영 · 보안 · Pulsemetry",
};

export default function Page() {
  return <OpsContent />;
}
