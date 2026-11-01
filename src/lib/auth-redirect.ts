import { routeAccess } from "./route-access";

/** 외부 URL, 인증/API 경로와 인코딩 우회를 허용하지 않는다. */
export function safeRedirectUrl(
  value: string | null | undefined,
): string | null {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020\u007f]/.test(value)
  )
    return null;
  try {
    const url = new URL(value, "https://app.invalid");
    const decoded = decodeURIComponent(url.pathname);
    if (
      url.origin !== "https://app.invalid" ||
      /[\\\u0000-\u0020\u007f]/.test(decoded) ||
      decoded.includes("//") ||
      decoded.includes("%")
    )
      return null;
    if (!["protected", "onboarding"].includes(routeAccess(url.pathname)))
      return null;
    if (decoded !== url.pathname) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
export function loginHref(returnTo?: string | null) {
  const safe = safeRedirectUrl(returnTo);
  return safe
    ? `/login?${new URLSearchParams({ redirecturl: safe })}`
    : "/login";
}
export function afterLoginHref(completed: boolean, returnTo?: string | null) {
  const safe = safeRedirectUrl(returnTo);
  if (!completed)
    return safe &&
      routeAccess(new URL(safe, "https://app.invalid").pathname) === "protected"
      ? `/onboarding?${new URLSearchParams({ redirecturl: safe })}`
      : "/onboarding";
  return safe &&
    routeAccess(new URL(safe, "https://app.invalid").pathname) === "protected"
    ? safe
    : "/overview";
}
