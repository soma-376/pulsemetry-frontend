import type { Metadata } from "next";
import { SecurityContent } from "@/components/security/SecurityContent";

export const metadata: Metadata = {
  title: "보안 · Pulsemetry",
};

export default function Page() {
  return <SecurityContent />;
}
