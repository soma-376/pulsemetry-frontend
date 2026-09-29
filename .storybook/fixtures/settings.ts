import { delay, http, HttpResponse } from "msw";
import { COMPANY_A, SEED_CATALOG } from "@/mocks/company-a";
import { settingsVendorSchema, type Settings } from "@/lib/api/settings";
import { onboardingHandlers } from "./onboarding";

export type SettingsScenario = "default" | "empty" | "load-error" | "save-error" | "conflict" | "loading" | "refreshing" | "detail-loading" | "slow-response" | "detail-error" | "scheduled";
const org = COMPANY_A.organization.organizationId;
const api = `*/api/v1/organizations/${org}`;
const failure = (code: string, status: number) => HttpResponse.json({ error: { code, message: code } }, { status });

/** A의 등록 제품을 복제한다. 미입력 계약과 알 수 없는 사용 지표는 null 그대로 둔다. */
export function settingsFixture(): Settings {
  const data: Settings = {
    meta: { organizationId: org, snapshotId: "storybook-settings" },
    ingest: { status: "unknown", reason: "source_not_available", asOf: `${COMPANY_A.asOf}T00:00:00Z`, lastReceivedAt: null, windowMinutes: 15, activeInstallations: null, observedMembers: null, eligibleMembers: 12, coverageRatio: null },
    capabilities: { editContracts: true, editCollectionPolicy: true, editAlertRules: false, notifyInstallations: false },
    summary: { configuredVendors: 1, unconfiguredVendors: 1, monthlySeatFeeUsd: null, contractedSeats: null, activeSeats7d: null, meteredMonthToDate: { availability: "unavailable", data: null } },
    vendors: { items: COMPANY_A.managedVendors.map(v => settingsVendorSchema.parse({ ...v, firstSeenAt: null, lastSeenAt: null, activeUsers7d: null, activeUsers30d: null, observation: "unobserved" })), totalCount: COMPANY_A.managedVendors.length, nextCursor: null },
    collectionPolicy: { version: 1, collectRawContent: false, reclaimIdleDays: 14, aggregateRetentionMonths: null },
    policyRollout: { desiredVersion: 1, eligibleInstallations: 10, appliedInstallations: 10, outdatedInstallations: 0, unknownInstallations: 0 },
    alertRules: [
      { ruleId: "spend_spike", enabled: false, availability: "unavailable", threshold: { value: 0.4, unit: "ratio" } },
      { ruleId: "quota_exceeded", enabled: false, availability: "unavailable", threshold: { value: 5, unit: "users" } },
      { ruleId: "model_not_allowed", enabled: false, availability: "unavailable", threshold: { value: 1, unit: "events" } },
      { ruleId: "tool_unapproved", enabled: false, availability: "unavailable", threshold: { value: 1, unit: "events" } },
    ],
  };
  return syncSettingsSummary(data);
}

export function syncSettingsSummary(data: Settings): Settings {
  const rows = data.vendors.items;
  const active = rows.filter(row => row.contractStatus === "active");
  data.vendors.totalCount = rows.length;
  data.summary.configuredVendors = active.length;
  data.summary.unconfiguredVendors = rows.length - active.length;
  data.summary.monthlySeatFeeUsd = active.every(row => row.contract?.monthlySeatFeeUsd != null)
    ? String(active.reduce((sum, row) => sum + Number(row.contract!.monthlySeatFeeUsd), 0)) : null;
  data.summary.contractedSeats = active.every(row => row.contract != null)
    ? active.reduce((sum, row) => sum + row.contract!.tiers.reduce((n, tier) => n + tier.seats, 0), 0) : null;
  return data;
}
export function settingsHandlers(scenario: SettingsScenario) {
  const data = settingsFixture();
  if (scenario === "empty") data.vendors.items = [];
  if (scenario === "scheduled") {
    const vendor = data.vendors.items.find(row => row.kind === "claude_team")!;
    vendor.contract!.effectiveFrom = "2026-10-01";
    vendor.contract!.effectiveTo = "2027-09-30";
  }
  let settingsRequests = 0;
  let detailRequests = 0;
  let failSave = scenario === "save-error";
  let conflict = scenario === "conflict";
  const sync = () => {
    const rows = data.vendors.items;
    for (const row of rows) {
      const c = row.contract;
      row.contractStatus = !c ? "missing" : c.effectiveFrom > COMPANY_A.asOf ? "scheduled" : c.effectiveTo && c.effectiveTo < COMPANY_A.asOf ? "expired" : "active";
      row.state = row.contractStatus === "active" ? "configured" : "needs_review";
    }
    return syncSettingsSummary(data);
  };
  return [
    http.get(`${api}/ingest-status`, () => HttpResponse.json({ organizationId: org, status: "unknown", reason: "source_not_available", asOf: `${COMPANY_A.asOf}T00:00:00Z`, lastReceivedAt: null })),
    http.get(`${api}/settings`, async () => {
      settingsRequests++;
      if (scenario === "loading" || (scenario === "refreshing" && settingsRequests > 1)) await delay("infinite");
      if (scenario === "slow-response") await delay(1500);
      return scenario === "load-error" ? failure("unavailable", 503) : HttpResponse.json(sync());
    }),
    http.get(`${api}/vendors/:id`, async ({ params }) => {
      if (scenario === "detail-loading") await delay("infinite");
      if (scenario === "detail-error" && ++detailRequests <= 3) return failure("unavailable", 503);
      const vendor = data.vendors.items.find(row => row.vendorId === params.id);
      return vendor ? HttpResponse.json({ meta: data.meta, vendor }) : failure("not_found", 404);
    }),
    http.patch(`${api}/vendors/:id`, async ({ params, request }) => {
      await delay(200);
      const vendor = data.vendors.items.find(row => row.vendorId === params.id);
      if (!vendor) return failure("not_found", 404);
      const body = await request.json() as { displayName: string; expectedVersion: number };
      if (failSave) { failSave = false; return failure("unavailable", 503); }
      if (conflict) { conflict = false; vendor.version++; vendor.displayName = "다른 관리자가 수정한 이름"; }
      if (body.expectedVersion !== vendor.version) return failure("version_conflict", 409);
      vendor.displayName = body.displayName; vendor.version++;
      return HttpResponse.json({ meta: data.meta, vendor });
    }),
    http.put(`${api}/vendors/:id/contract`, async ({ params, request }) => {
      const vendor = data.vendors.items.find(row => row.vendorId === params.id);
      if (!vendor) return failure("not_found", 404);
      const body = await request.json() as { expectedVersion: number; displayName: string; contract: NonNullable<typeof vendor.contract> };
      if (body.expectedVersion !== vendor.version) return failure("version_conflict", 409);
      const plans = SEED_CATALOG.plans[vendor.kind];
      if (!plans?.some(plan => plan.id === body.contract.planId)) return failure("invalid_plan", 422);
      vendor.version++;
      vendor.displayName = body.displayName;
      vendor.contract = { ...body.contract, version: vendor.version,
        effectiveFrom: vendor.contract?.effectiveFrom ?? body.contract.effectiveFrom,
        tiers: body.contract.tiers.map((tier, index) => ({ ...tier, tierId: `tier-${index}` })),
        monthlySeatFeeUsd: String(body.contract.tiers.reduce((sum, tier) => sum + tier.seats * Number(tier.monthlyFeePerSeatUsd), 0)),
        confirmedAt: new Date().toISOString(), confirmedBy: COMPANY_A.members[0].memberId,
      };
      sync();
      return HttpResponse.json({ meta: data.meta, vendor });
    }),
    http.post(`${api}/vendors`, async ({ request }) => {
      const body = await request.json() as { kind: string; displayName: string; contract?: NonNullable<Settings["vendors"]["items"][number]["contract"]> };
      if (data.vendors.items.some(vendor => vendor.kind === body.kind)) return failure("vendor_already_registered", 409);
      if (!SEED_CATALOG.items.some(product => product.id === body.kind)) return failure("invalid_vendor", 422);
      const vendor = settingsVendorSchema.parse({ ...body, contractStatus: body.contract ? "active" : "missing", vendorId: crypto.randomUUID(), version: 1, source: "manual", contract: body.contract ? {
        ...body.contract, version: 1, tiers: body.contract.tiers.map((tier, index) => ({ ...tier, tierId: `tier-${index}` })),
        monthlySeatFeeUsd: String(body.contract.tiers.reduce((sum, tier) => sum + tier.seats * Number(tier.monthlyFeePerSeatUsd), 0)),
        confirmedAt: new Date().toISOString(), confirmedBy: COMPANY_A.members[0].memberId,
      } : null, state: body.contract ? "configured" : "needs_review", observation: "unobserved", firstSeenAt: null, lastSeenAt: null, activeUsers7d: null, activeUsers30d: null });
      data.vendors.items.push(vendor);
      return HttpResponse.json({ meta: data.meta, vendor }, { status: 201 });
    }),
    http.put(`${api}/collection-policy`, async ({ request }) => {
      const body = await request.json() as { expectedVersion: number; collectRawContent: boolean };
      if (body.expectedVersion !== data.collectionPolicy.version) return failure("version_conflict", 409);
      data.collectionPolicy.version++; data.collectionPolicy.collectRawContent = body.collectRawContent;
      data.policyRollout.desiredVersion++; data.policyRollout.appliedInstallations = 0; data.policyRollout.outdatedInstallations = 10;
      return HttpResponse.json({ version: data.collectionPolicy.version, collectRawContent: body.collectRawContent, confirmedAt: new Date().toISOString(), application: "future_enrollments", existingInstallationsUpdated: false });
    }),
    http.get(`${api}/installations`, () => HttpResponse.json({ meta: data.meta, installations: { items: [], nextCursor: null } })),
    http.delete(`${api}/vendors/:id/contract`, ({ params, request }) => {
      const vendor = data.vendors.items.find(row => row.vendorId === params.id);
      if (!vendor) return failure("not_found", 404);
      if (request.headers.get("If-Match") !== `"vendor-${vendor.version}"`) return failure("version_conflict", 409);
      vendor.contract = null; vendor.version++; vendor.state = "needs_review"; vendor.contractStatus = "missing";
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete(`${api}/vendors/:id`, ({ params, request }) => {
      const index = data.vendors.items.findIndex(row => row.vendorId === params.id);
      if (index < 0) return failure("not_found", 404);
      if (request.headers.get("If-Match") !== `"vendor-${data.vendors.items[index].version}"`) return failure("version_conflict", 409);
      data.vendors.items.splice(index, 1);
      return new HttpResponse(null, { status: 204 });
    }),
    ...onboardingHandlers("teams"),
  ];
}
