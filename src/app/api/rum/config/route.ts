import { rumConfig } from "@/lib/rum/server";
export const dynamic = "force-dynamic";
export function GET() {
  const config = rumConfig();
  return Response.json(
    { enabled: Boolean(config), environment: config?.environment },
    { headers: { "Cache-Control": "no-store" } },
  );
}
