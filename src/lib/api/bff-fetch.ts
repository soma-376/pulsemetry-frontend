import { bffUrl } from "./bff-url";

/** 서비스 토큰은 BFF만 사용하고 브라우저는 세션 쿠키로 요청한다. */
export function bffFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.delete("Authorization");
  headers.set("X-Pulsemetry-Request", "1");
  return fetch(bffUrl(path), {
    ...init,
    credentials: "include",
    headers,
  });
}
