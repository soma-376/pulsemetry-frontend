import { createRumHandler } from "@/lib/rum/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const collect = createRumHandler();
export async function POST(request: Request) {
  return collect(request);
}
