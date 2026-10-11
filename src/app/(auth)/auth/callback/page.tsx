import { OidcCallback } from "@/components/auth/OidcCallback";
export const metadata = { referrer: "no-referrer" };
export const dynamic = "force-dynamic";
export default function CallbackPage() {
  return <OidcCallback />;
}
