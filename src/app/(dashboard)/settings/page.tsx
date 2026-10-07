import type { Metadata } from "next";
import { SettingsContent } from "@/components/settings/SettingsContent";

export const metadata: Metadata = {
  title: "설정 · Pulsemetry",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ vendor?: string | string[] }>;
}) {
  const { vendor } = await searchParams;
  const initialVendorId =
    typeof vendor === "string" && vendor ? vendor : undefined;
  return (
    <SettingsContent
      key={initialVendorId ?? "settings"}
      initialVendorId={initialVendorId}
    />
  );
}
