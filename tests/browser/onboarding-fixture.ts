import { test, type Page } from "@playwright/test";
import settingsExample from "../../docs/api/settings-response.example.json";
import { SEED_CATALOG } from "../../src/mocks/company-a";
const installed = new WeakSet<Page>();
const settingsServed = new WeakSet<Page>();

/**
 * 설정 화면의 조회(dashboard `GET /settings`·`GET /vendors/{id}`)와 벤더 명령(enrollment `PATCH /vendors/{id}`·`PUT|DELETE /vendors/{id}/contract`)을
 * 온보딩과 같은 벤더 목록으로 흉내 낸다. 규칙은 백엔드 명세 §12(벤더 계약)를 옮긴 것이다 — 제품 kind 당 등록 하나(409 `vendor_already_registered`),
 * 서버가 tierId·월 합계·확인 시각을 정하고, 계약 정정은 저장된 시작일을 유지하며, PATCH 는 표시 이름만 바꾼다. 자기 경로를 직접 흉내 내는 테스트와
 * 겹치지 않게 부른 테스트에서만 켠다(`openDashboard` 전에 부른다).
 */
export function serveSettings(page: Page) { settingsServed.add(page); }

type Tier = { tierId: string; label: string; seats: number; monthlyFeePerSeatUsd: string };
type Contract = { version: number; planId: string; effectiveFrom: string; effectiveTo: string | null; termNote: string | null; tiers: Tier[];
  monthlySeatFeeUsd: string; confirmedAt: string; confirmedBy: string };
type ContractWrite = { planId: string; effectiveFrom: string; effectiveTo: string | null; termNote?: string | null; tiers: { label: string; seats: number; monthlyFeePerSeatUsd: string }[] };
type Vendor = { vendorId: string; kind: string; displayName: string; source: string; version: number; state: string; contract: Contract | null };

function seoulToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function storedContract(write: ContractWrite, version: number, existing: Contract | null): Contract {
  const tiers = write.tiers.map((tier, index) => ({ tierId: `tier-${index + 1}`, label: tier.label, seats: tier.seats, monthlyFeePerSeatUsd: tier.monthlyFeePerSeatUsd }));
  const total = tiers.reduce((sum, tier) => sum + tier.seats * Number(tier.monthlyFeePerSeatUsd), 0);
  return { version, planId: write.planId, effectiveFrom: existing?.effectiveFrom ?? write.effectiveFrom, effectiveTo: write.effectiveTo, termNote: write.termNote ?? null, tiers,
    monthlySeatFeeUsd: total.toFixed(6), confirmedAt: new Date().toISOString(), confirmedBy: "fixture-admin" };
}
function settingsVendor(vendor: Vendor) {
  const contract = vendor.contract, today = seoulToday();
  const contractStatus = !contract ? "missing" : contract.effectiveFrom > today ? "scheduled" : contract.effectiveTo && contract.effectiveTo < today ? "expired" : "active";
  return { ...vendor, contractStatus, observation: "unobserved", firstSeenAt: null, lastSeenAt: null, activeUsers7d: null, activeUsers30d: null };
}

export async function mockOnboarding(page: Page) {
  if (installed.has(page)) return;
  installed.add(page);
  const org = "11111111-1111-4111-8111-111111111111";
  const state = { organizationId: org, completed: false, completedAt: null as string | null, policy: { confirmed: false, confirmedAt: null as string | null, version: 1, collectRawContent: null as boolean | null }, selectedVendorCount: 0, canComplete: false, nextStep: "collection" };
  const vendors: Vendor[] = [];
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
    const settings = settingsServed.has(page);
    if (!path || !(settings ? /^\/(onboarding|collection-policy|vendors|teams|settings)(\/|$)/ : /^\/(onboarding|collection-policy|vendors|teams)(\/|$)/).test(path)) return route.fallback();
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const json = (value: unknown, status = 200) => route.fulfill({ status, headers: cors, json: value });
    const empty = () => route.fulfill({ status: 204, headers: cors });
    const body = ["POST", "PUT", "PATCH"].includes(method) ? req.postDataJSON() : null;
    const meta = { organizationId: org, snapshotId: "fixture-snapshot" };
    state.selectedVendorCount = vendors.length;
    state.canComplete = state.policy.confirmed && vendors.length > 0;
    state.nextStep = state.completed ? "complete" : !state.policy.confirmed ? "collection" : !vendors.length ? "vendors" : "team";
    if (path === "/onboarding") return json(state);
    if (path === "/collection-policy") {
      if (body.expectedVersion !== state.policy.version) return json({ error: { code: "version_conflict", message: "conflict" } }, 409);
      state.policy = { confirmed: true, confirmedAt: new Date().toISOString(), version: state.policy.version + 1, collectRawContent: body.collectRawContent };
      return json({ version: state.policy.version, collectRawContent: body.collectRawContent, confirmedAt: state.policy.confirmedAt, application: "future_enrollments", existingInstallationsUpdated: false,
        reclaimIdleDays: null, aggregateRetentionMonths: null, settingsVersion: 0, settingsUpdatedAt: null, cleanupOperationId: null });
    }
    if (path === "/onboarding/complete") { state.completed = true; state.completedAt = new Date().toISOString(); state.nextStep = "complete"; return json(state); }
    if (path === "/vendors" && method === "GET") return json({ meta, vendors: { items: vendors, nextCursor: null } });
    if (path === "/vendors" && method === "POST") {
      if (vendors.some(v => v.kind === body.kind)) return json({ error: { code: "vendor_already_registered", message: "conflict" } }, 409);
      const vendor: Vendor = { vendorId: crypto.randomUUID(), source: "manual", version: 1, state: body.contract ? "configured" : "needs_review",
        contract: body.contract ? storedContract(body.contract, 1, null) : null, kind: body.kind, displayName: body.displayName };
      vendors.push(vendor); return json({ meta, vendor: settingsVendor(vendor) }, 201);
    }
    const target = path.match(/^\/vendors\/([^/]+)(\/contract)?$/);
    const vendor = target ? vendors.find(v => v.vendorId === target[1]) : undefined;
    if (target && !target[2] && method === "DELETE") { if (vendor) vendors.splice(vendors.indexOf(vendor), 1); return empty(); }
    if (settings && path === "/settings" && method === "GET") {
      const data = structuredClone(settingsExample);
      const items = vendors.map(settingsVendor);
      const configured = items.filter(item => item.contract);
      return json({ ...data, meta: { ...data.meta, organizationId: org },
        summary: { ...data.summary, configuredVendors: configured.length, unconfiguredVendors: items.length - configured.length,
          monthlySeatFeeUsd: configured.reduce((sum, item) => sum + Number(item.contract!.monthlySeatFeeUsd), 0).toFixed(6),
          contractedSeats: configured.reduce((sum, item) => sum + item.contract!.tiers.reduce((seats, tier) => seats + tier.seats, 0), 0) },
        vendors: { items, totalCount: items.length, nextCursor: null } });
    }
    if (settings && target && vendor) {
      if (method === "GET" && !target[2]) return json({ meta, vendor: settingsVendor(vendor) });
      const expected = method === "DELETE" ? Number(req.headers()["if-match"]?.match(/\d+/)?.[0]) : body.expectedVersion;
      if (expected !== vendor.version) return json({ error: { code: "version_conflict", message: "conflict" } }, 409);
      vendor.version++;
      if (method === "PATCH" && !target[2]) vendor.displayName = body.displayName;
      else if (method === "PUT" && target[2]) { vendor.displayName = body.displayName; vendor.contract = storedContract(body.contract, vendor.version, vendor.contract); vendor.state = "configured"; }
      else if (method === "DELETE" && target[2]) { vendor.contract = null; vendor.state = "needs_review"; return empty(); }
      else return route.fallback();
      return json({ meta, vendor: settingsVendor(vendor) });
    }
    if (path === "/teams" && method === "GET") return json({ meta, teams: { items: teams, nextCursor: null } });
    if (path === "/teams" && method === "POST") { const team = { teamId: crypto.randomUUID(), teamName: body.teamName, version: 1 }; teams.push(team); return json(team, 201); }
    if (path.startsWith("/teams/") && method === "DELETE") { const index = teams.findIndex(t => path.endsWith(t.teamId)); if (index >= 0) teams.splice(index, 1); return empty(); }
    return route.fallback();
  });
}
