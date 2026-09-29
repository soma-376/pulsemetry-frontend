import { test, type Page } from "@playwright/test";
import { SEED_CATALOG } from "../../src/mocks/company-a";
const installed = new WeakSet<Page>();
export async function mockOnboarding(page: Page) {
  if (installed.has(page)) return;
  installed.add(page);
  const org = "11111111-1111-4111-8111-111111111111";
  const state = { organizationId: org, completed: false, completedAt: null as string | null, policy: { confirmed: false, confirmedAt: null as string | null, version: 1, collectRawContent: null as boolean | null }, selectedVendorCount: 0, canComplete: false, nextStep: "collection" };
  const vendors: { vendorId: string; kind: string; displayName: string; source: string; version: number; state: string; contract: unknown }[] = [];
  const teams = [{ teamId: "server-team", teamName: "서버 팀", version: 7 }];
  const products = [
    { id: "server_only", provider: "new", displayName: "서버 전용 제품", product: "Server IDE", allowsSeatTiers: true },
    ...SEED_CATALOG.items.filter(product => ["copilot", "claude_team"].includes(product.id)),
  ];
  const cors = { "access-control-allow-origin": new URL(test.info().project.use.baseURL!).origin, "access-control-allow-headers": "content-type,authorization,idempotency-key,if-match", "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS" };
  await page.route("**/api/v1/vendor-catalog**", route => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const kind = new URL(route.request().url()).pathname.split("/").at(-2);
    const product = products.find(p => p.id === kind);
    return route.fulfill({ headers: cors, json: product ? { catalogVersion: "test", vendor: product, plans: kind === "server_only" ? [{ id: "team", displayName: "Team", billing: "seat", separateUsageBilling: true }] : SEED_CATALOG.plans[kind!] } : { catalogVersion: "test", items: products, totalCount: products.length, nextCursor: null } });
  });
  await page.route("**/api/v1/organizations/*/**", async route => {
    const req = route.request(), method = req.method(), path = new URL(req.url()).pathname.split(`/organizations/${org}`)[1];
    if (!path || !/^\/(onboarding|collection-policy|vendors|teams)(\/|$)/.test(path)) return route.fallback();
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const json = (value: unknown, status = 200) => route.fulfill({ status, headers: cors, json: value });
    const empty = () => route.fulfill({ status: 204, headers: cors });
    const body = method === "POST" || method === "PUT" ? req.postDataJSON() : null;
    const meta = { organizationId: org, snapshotId: "fixture-snapshot" };
    state.selectedVendorCount = vendors.length;
    state.canComplete = state.policy.confirmed && vendors.length > 0;
    state.nextStep = state.completed ? "complete" : !state.policy.confirmed ? "collection" : !vendors.length ? "vendors" : "team";
    if (path === "/onboarding") return json(state);
    if (path === "/collection-policy") {
      if (body.expectedVersion !== state.policy.version) return json({ error: { code: "version_conflict", message: "conflict" } }, 409);
      state.policy = { confirmed: true, confirmedAt: new Date().toISOString(), version: state.policy.version + 1, collectRawContent: body.collectRawContent };
      return json({ version: state.policy.version, collectRawContent: body.collectRawContent, confirmedAt: state.policy.confirmedAt, application: "future_enrollments", existingInstallationsUpdated: false });
    }
    if (path === "/onboarding/complete") { state.completed = true; state.completedAt = new Date().toISOString(); state.nextStep = "complete"; return json(state); }
    if (path === "/vendors" && method === "GET") return json({ meta, vendors: { items: vendors, nextCursor: null } });
    if (path === "/vendors" && method === "POST") {
      const vendor = { vendorId: crypto.randomUUID(), source: "manual", version: 1, state: body.contract ? "configured" : "needs_review", contract: body.contract ?? null, kind: body.kind, displayName: body.displayName };
      vendors.push(vendor); return json({ vendor }, 201);
    }
    if (path.startsWith("/vendors/") && method === "DELETE") { const index = vendors.findIndex(v => path.endsWith(v.vendorId)); if (index >= 0) vendors.splice(index, 1); return empty(); }
    if (path === "/teams" && method === "GET") return json({ meta, teams: { items: teams, nextCursor: null } });
    if (path === "/teams" && method === "POST") { const team = { teamId: crypto.randomUUID(), teamName: body.teamName, version: 1 }; teams.push(team); return json(team, 201); }
    if (path.startsWith("/teams/") && method === "DELETE") { const index = teams.findIndex(t => path.endsWith(t.teamId)); if (index >= 0) teams.splice(index, 1); return empty(); }
    return route.fallback();
  });
}
