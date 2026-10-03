export type RouteAccess = "public" | "guest" | "onboarding" | "protected" | "entry";
const dashboards = ["/overview", "/teams", "/members", "/settings", "/ops"];
const within = (path: string, root: string) => path === root || path.startsWith(root + "/");
export function routeAccess(pathname: string): RouteAccess {
  if (pathname === "/") return "entry";
  if (pathname === "/login" || pathname === "/login/") return "guest";
  if (within(pathname, "/onboarding")) return "onboarding";
  if (dashboards.some(root => within(pathname, root))) return "protected";
  return "public";
}
export function routeDestination(access: RouteAccess, authenticated: boolean, completed = false): string | null {
  if (access === "public") return null;
  if (!authenticated) return access === "guest" ? null : "/login";
  if (!completed) return access === "onboarding" ? null : "/onboarding";
  return access === "protected" ? null : "/overview";
}
