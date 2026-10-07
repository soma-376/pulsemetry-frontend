import type { Metadata } from "next";
import { MembersContent } from "@/components/members/MembersContent";

export const metadata: Metadata = {
  title: "구성원 · Pulsemetry",
};

export default function MembersPage() {
  return <MembersContent />;
}
