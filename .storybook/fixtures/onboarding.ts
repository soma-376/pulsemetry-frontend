import { delay, http, HttpResponse } from "msw";
import type { BackendSession } from "@/lib/api/session";
import type { ManagedVendor, OnboardingState, ServerTeam } from "@/lib/api/management";
import { COMPANY_A, COMPANY_A_TEAMS, COMPANY_A_VENDORS, SEED_CATALOG } from "@/mocks/company-a";

export type OnboardingScenario = "collection" | "vendors" | "teams" | "loading" | "load-error" | "save-error";
const org = COMPANY_A.organization.organizationId;
const timestamp = `${COMPANY_A.asOf}T00:00:00Z`;
const api = `*/api/v1/organizations/${org}`;
const products = SEED_CATALOG.items;
const plans = SEED_CATALOG.plans;
const admin = COMPANY_A.members.find(member => member.role === "admin")!;
const session: BackendSession = {
  tokens: { access_token: "storybook-only", refresh_token: "storybook-only", token_type: "Bearer", expires_in: 3600 },
  user: { memberId: admin.memberId, organizationId: org, organizationName: COMPANY_A.organization.name, email: admin.email, displayName: admin.displayName, role: "admin" },
};
const failure = (code: string, status: number) => HttpResponse.json({ error: { code, message: code } }, { status });

// 스토리 시작 때마다 새 상태를 생성합니다. 실제 시드 DB와는 연결하지 않습니다.
export function onboardingHandlers(scenario: OnboardingScenario) {
  const confirmed = ["vendors", "teams", "save-error"].includes(scenario);
  const state: OnboardingState = {
    organizationId: org, completed: false, completedAt: null,
    policy: { confirmed, confirmedAt: confirmed ? timestamp : null, version: 1, collectRawContent: confirmed ? false : null },
    selectedVendorCount: 0, canComplete: false, nextStep: confirmed ? "vendors" : "collection",
  };
  // 단계별 화면 테스트를 위한 A의 명시적 변형. 원본 A는 온보딩 완료 상태로 보존한다.
  const vendors: ManagedVendor[] = scenario === "teams" ? structuredClone(COMPANY_A_VENDORS) : [];
  const teams: ServerTeam[] = scenario === "teams" ? structuredClone(COMPANY_A_TEAMS) : [];
  let loadFailures = scenario === "load-error" ? 3 : 0;
  let saveFailures = scenario === "save-error" ? 3 : 0;
  const sync = () => {
    state.selectedVendorCount = vendors.length;
    state.canComplete = state.policy.confirmed && vendors.length > 0;
    state.nextStep = state.completed ? "complete" : !state.policy.confirmed ? "collection" : vendors.length ? "team" : "vendors";
    return state;
  };
  const meta = { organizationId: org, snapshotId: "storybook" };
  return [
    http.post("*/api/dev/seed-login", () => HttpResponse.json(session)),
    http.post("*/v1/auth/logout", () => new HttpResponse(null, { status: 204 })),
    http.get(`${api}/onboarding`, async () => {
      if (scenario === "loading") await delay("infinite");
      if (loadFailures-- > 0) return failure("unavailable", 503);
      return HttpResponse.json(sync());
    }),
    http.put(`${api}/collection-policy`, async ({ request }) => {
      await delay(400);
      const body = await request.json() as { expectedVersion: number; collectRawContent: boolean };
      if (body.expectedVersion !== state.policy.version) return failure("version_conflict", 409);
      state.policy = { confirmed: true, confirmedAt: timestamp, version: state.policy.version + 1, collectRawContent: body.collectRawContent };
      return HttpResponse.json({ ...state.policy, application: "future_enrollments", existingInstallationsUpdated: false,
        reclaimIdleDays: null, aggregateRetentionMonths: null, settingsVersion: 0, settingsUpdatedAt: null, cleanupOperationId: null });
    }),
    http.get("*/api/v1/vendor-catalog", () => HttpResponse.json({ catalogVersion: SEED_CATALOG.catalogVersion, items: products, totalCount: products.length, nextCursor: null })),
    http.get("*/api/v1/vendor-catalog/:kind/plans", ({ params }) => {
      const vendor = products.find(product => product.id === params.kind);
      return vendor ? HttpResponse.json({ catalogVersion: SEED_CATALOG.catalogVersion, vendor, plans: plans[vendor.id] }) : failure("not_found", 404);
    }),
    http.get(`${api}/vendors`, () => HttpResponse.json({ meta, vendors: { items: vendors, nextCursor: null } })),
    http.post(`${api}/vendors`, async ({ request }) => {
      await delay(400);
      if (saveFailures-- > 0) return failure("unavailable", 503);
      const body = await request.json() as Pick<ManagedVendor, "kind" | "displayName" | "contract">;
      if (vendors.some(vendor => vendor.kind === body.kind)) return failure("vendor_already_registered", 409);
      if (!products.some(product => product.id === body.kind)) return failure("invalid_vendor", 400);
      if (body.contract && !plans[body.kind]?.some(plan => plan.id === body.contract?.planId)) return failure("invalid_plan", 422);
      const vendor: ManagedVendor = { ...body, contract: body.contract ?? null, vendorId: crypto.randomUUID(), source: "manual", version: 1, state: body.contract ? "configured" : "needs_review" };
      vendors.push(vendor);
      return HttpResponse.json({ vendor }, { status: 201 });
    }),
    http.delete(`${api}/vendors/:id`, async ({ params }) => {
      await delay(300);
      const index = vendors.findIndex(vendor => vendor.vendorId === params.id);
      if (index < 0) return failure("not_found", 404);
      vendors.splice(index, 1);
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(`${api}/teams`, () => HttpResponse.json({ meta, teams: { items: teams, nextCursor: null } })),
    http.post(`${api}/teams`, async ({ request }) => {
      await delay(400);
      const { teamName } = await request.json() as { teamName: string };
      if (teams.some(team => team.teamName === teamName)) return failure("team_name_conflict", 409);
      const team = { teamId: crypto.randomUUID(), teamName, version: 1 };
      teams.push(team);
      return HttpResponse.json(team, { status: 201 });
    }),
    http.delete(`${api}/teams/:id`, async ({ params }) => {
      await delay(300);
      const index = teams.findIndex(team => team.teamId === params.id);
      if (index < 0) return failure("not_found", 404);
      teams.splice(index, 1);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(`${api}/onboarding/complete`, async () => {
      await delay(500);
      if (!sync().canComplete) return failure("onboarding_incomplete", 409);
      state.completed = true;
      state.completedAt = timestamp;
      return HttpResponse.json(sync());
    }),
  ];
}
