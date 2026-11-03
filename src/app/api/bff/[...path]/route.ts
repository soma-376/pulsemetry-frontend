import { runtimeBffOriginPolicy } from "@/lib/server/bff-origin";
import { getBff } from "@/lib/server/bff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  try {
    if (request.method === "OPTIONS")
      return runtimeBffOriginPolicy().preflight(request);
    return await getBff().handle(request);
  } catch {
    const response = Response.json(
      {
        error: {
          code: "unavailable",
          message: "인증 서버 설정을 확인해 주세요.",
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
    try {
      return runtimeBffOriginPolicy().cors(request, response);
    } catch {
      return response;
    }
  }
}
export {
  handle as OPTIONS,
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
};
