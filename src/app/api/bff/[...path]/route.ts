import { getBff } from "@/lib/server/bff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  try { return await getBff().handle(request); }
  catch {
    return Response.json({ error: { code: "unavailable", message: "인증 서버 설정을 확인해 주세요." } },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
