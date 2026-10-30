export const dynamic = "force-dynamic";

// ALB가 프론트 HTTP 서버의 응답 가능 여부만 확인한다.
export function GET() {
  return Response.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
