import type { Metadata } from "next";
import { SettingsContent } from "@/components/settings/SettingsContent";

export const metadata: Metadata = {
  title: "설정 · Pulsemetry",
};

export default function SettingsPage() {
  return <SettingsContent />;
}
