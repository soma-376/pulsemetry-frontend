import { NextResponse, type NextRequest } from "next/server";
import { routeAccess } from "./lib/route-access";
import {
  createSessionCookie,
  sessionCookieConfig,
} from "./lib/server/session-cookie";

export function proxy(request: NextRequest) {
  const access = routeAccess(request.nextUrl.pathname);
  if (!["protected", "onboarding", "entry"].includes(access))
    return NextResponse.next();
  try {
    const session = createSessionCookie(sessionCookieConfig()).read(request);
    if (!session) {
      const destination = request.nextUrl.clone();
      destination.pathname = "/login";
      destination.search = "";
      const response = NextResponse.redirect(destination);
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    return NextResponse.next();
  } catch {
    // 설정 장애는 로그아웃으로 오인하지 않고 보호 화면도 노출하지 않는다.
    return new NextResponse(
      "인증 설정을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      {
        status: 503,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
export const config = {
  matcher: [
    "/",
    "/overview/:path*",
    "/teams/:path*",
    "/members/:path*",
    "/settings/:path*",
    "/ops/:path*",
    "/onboarding/:path*",
  ],
};
