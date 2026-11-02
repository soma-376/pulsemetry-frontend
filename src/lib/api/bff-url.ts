/** 공개 BFF origin을 지정하면 원격 BFF를 사용하고, 미설정 시 동일 출처를 사용한다. */
export function bffUrl(path: string): string {
  if (!path.startsWith("/api/bff/") || path.includes("\\"))
    throw new Error("BFF 경로만 사용할 수 있습니다.");
  const configured = process.env.NEXT_PUBLIC_BFF_ORIGIN?.trim();
  if (!configured) return path;
  const origin = new URL(configured);
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new Error("NEXT_PUBLIC_BFF_ORIGIN에는 HTTP(S) origin을 설정하세요.");
  return new URL(path, origin).href;
}
