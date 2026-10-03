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
    capabilities: { editContracts: true, editCollectionPolicy: true, editAlertRules: false, notifyInstallations: true },
    summary: { configuredVendors: 1, unconfiguredVendors: 1, monthlySeatFeeUsd: null, contractedSeats: null, activeSeats7d: null, meteredMonthToDate: { availability: "unavailable", data: null } },
    vendors: { items: COMPANY_A.managedVendors.map(v => settingsVendorSchema.parse({ ...v, firstSeenAt: null, lastSeenAt: null, activeUsers7d: null, activeUsers30d: null, observation: "unobserved" })), totalCount: COMPANY_A.managedVendors.length, nextCursor: null },
    collectionPolicy: { version: COMPANY_A.policyRollout.desiredVersion, collectRawContent: false, reclaimIdleDays: 14, aggregateRetentionMonths: null,
      settingsVersion: 0, settingsUpdatedAt: null, reclaimIdleDaysSource: "default",
      options: { reclaimIdleDays: [7, 14, 30, 60], aggregateRetentionMonths: [12, 24, 36, null] }, cleanupOperationId: null },
    // 시드 A의 적용 현황(판 2: 적용 7 · 미적용 3 · 미확인 1).
    policyRollout: { desiredVersion: COMPANY_A.policyRollout.desiredVersion, eligibleInstallations: COMPANY_A.policyRollout.eligible,
      appliedInstallations: COMPANY_A.policyRollout.applied, outdatedInstallations: COMPANY_A.policyRollout.outdated, unknownInstallations: COMPANY_A.policyRollout.unknown },
    // 시드 A: 급증·비허용 모델·미승인 도구를 켰다. 한도 초과는 근거가 없어 켤 수 없다(서버 ADR 0051).
    alertRules: [
      { ruleId: "spend_spike", version: 1, enabled: true, availability: "available", reason: null, threshold: { value: 0.4, unit: "ratio" },
        evaluationWindow: "last_complete_7_calendar_days", comparisonWindow: "preceding_7_calendar_days" },
      { ruleId: "quota_exceeded", version: 0, enabled: false, availability: "unavailable", reason: "source_not_available", threshold: { value: 5, unit: "users" },
        evaluationWindow: "rolling_24_hours", comparisonWindow: null },
      { ruleId: "model_not_allowed", version: 1, enabled: true, availability: "available", reason: null, threshold: { value: 1, unit: "events" },
        evaluationWindow: "rolling_24_hours", comparisonWindow: null },
      { ruleId: "tool_unapproved", version: 1, enabled: true, availability: "available", reason: null, threshold: { value: 1, unit: "events" },
        evaluationWindow: "rolling_24_hours", comparisonWindow: null },
    ],
    alertLists: {
      allowedModels: { listId: "allowed_models", version: 1, entries: COMPANY_A.alertLists.allowed_models, updatedAt: "2026-09-20T15:00:00Z" },
      approvedTools: { listId: "approved_tools", version: 1, entries: COMPANY_A.alertLists.approved_tools, updatedAt: "2026-09-20T15:00:00Z" },
    },
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
  const operations = new Map<string, { polls: number; targets: string[] }>();
  /** 보존 정리 작업 — 보존 작업을 실행하지 않는 Storybook 에서는 대기에 머문다. */
  const cleanups = new Set<string>();
  const cleanup = (id: string) => ({ operationId: id, kind: "retention_cleanup", status: "pending", createdAt: new Date().toISOString(), completedAt: null,
    results: [{ targetId: "analysis_source", status: "pending", reason: null, action: null }], canRestore: false, restoreUntil: null, retention: null });
  const operation = (id: string) => {
    const state = operations.get(id)!;
    const done = state.polls >= 2;
    const results = state.targets.map((targetId, index) => ({ targetId, status: !done ? "pending" : index === 0 ? "failed" : "succeeded", reason: done && index === 0 ? "recipient_rejected" : null, action: null }));
    return { operationId: id, kind: "installation_notification", status: !done ? "running" : results.length > 1 ? "partially_failed" : "failed", createdAt: new Date().toISOString(),
      completedAt: done ? new Date().toISOString() : null, results, canRestore: false, restoreUntil: null, retention: null };
  };
  const installations = () => COMPANY_A.installations.map(row => ({ installationId: row.installationId, memberId: row.memberId,
    account: COMPANY_A.members.find(member => member.memberId === row.memberId)?.email ?? null, team: { teamId: null, teamName: null },
    agentVersion: row.agentVersion, appliedPolicyVersion: row.appliedPolicyVersion, lastHeartbeatAt: row.lastHeartbeatAt,
    canNotify: data.capabilities.notifyInstallations && row.canNotify }));
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
      const body = await request.json() as { expectedVersion: number; collectRawContent?: boolean; expectedSettingsVersion?: number; reclaimIdleDays?: number; aggregateRetentionMonths?: number | null };
      const policy = data.collectionPolicy;
      if (body.expectedVersion !== policy.version) return failure("version_conflict", 409);
      const settings = "reclaimIdleDays" in body || "aggregateRetentionMonths" in body;
      if (settings && body.expectedSettingsVersion !== policy.settingsVersion) return failure("version_conflict", 409);
      if (body.collectRawContent !== undefined) {
        policy.version++; policy.collectRawContent = body.collectRawContent;
        const rollout = data.policyRollout;
        rollout.desiredVersion++; rollout.outdatedInstallations += rollout.appliedInstallations; rollout.appliedInstallations = 0;
      }
      let cleanupOperationId: string | null = null;
      if (settings) {
        const before = policy.aggregateRetentionMonths;
        const next = "aggregateRetentionMonths" in body ? body.aggregateRetentionMonths ?? null : before;
        if (body.reclaimIdleDays !== undefined) { policy.reclaimIdleDays = body.reclaimIdleDays; policy.reclaimIdleDaysSource = "organization"; }
        policy.aggregateRetentionMonths = next; policy.settingsVersion++; policy.settingsUpdatedAt = new Date().toISOString();
        // 서버처럼 줄였을 때만 정리 작업을 만든다. Storybook 에서는 대기에 머문다.
        if (next !== null && (before === null || next < before)) {
          cleanupOperationId = crypto.randomUUID();
          cleanups.add(cleanupOperationId);
          policy.cleanupOperationId = cleanupOperationId;
        }
      }
      return HttpResponse.json({ version: policy.version, collectRawContent: policy.collectRawContent, confirmedAt: new Date().toISOString(), application: "future_enrollments", existingInstallationsUpdated: false,
        reclaimIdleDays: policy.reclaimIdleDaysSource === "organization" ? policy.reclaimIdleDays : null, aggregateRetentionMonths: policy.aggregateRetentionMonths,
        settingsVersion: policy.settingsVersion, settingsUpdatedAt: policy.settingsUpdatedAt, cleanupOperationId });
    }),
    http.get(`${api}/installations`, ({ request }) => {
      const status = new URL(request.url).searchParams.get("policyStatus");
      const desired = data.policyRollout.desiredVersion;
      const items = installations().filter(row => !status || (row.appliedPolicyVersion == null ? "unknown" : row.appliedPolicyVersion >= desired ? "applied" : "outdated") === status);
      return HttpResponse.json({ meta: data.meta, desiredPolicyVersion: desired, installations: { items, totalCount: items.length, nextCursor: null } });
    }),
    // 안내는 접수(202) 뒤 작업 상태 조회가 한 번 running(Retry-After)을 거쳐 끝난다. 첫 대상은 수신 거부로 실패한다.
    http.post(`${api}/installation-update-notifications`, async ({ request }) => {
      if (!data.capabilities.notifyInstallations) return failure("notification_channel_unavailable", 422);
      const body = await request.json() as { installationIds: string[]; expectedPolicyVersion: number };
      if (body.expectedPolicyVersion !== data.policyRollout.desiredVersion) return failure("version_conflict", 409);
      const operationId = crypto.randomUUID();
      operations.set(operationId, { polls: 0, targets: body.installationIds });
      return HttpResponse.json(operation(operationId), { status: 202, headers: { Location: `/api/v1/organizations/${org}/operations/${operationId}` } });
    }),
    http.get(`${api}/operations/:id`, ({ params }) => {
      if (cleanups.has(String(params.id))) return HttpResponse.json(cleanup(String(params.id)), { headers: { "Retry-After": "5" } });
      const state = operations.get(String(params.id));
      if (!state) return failure("not_found", 404);
      state.polls++;
      const body = operation(String(params.id));
      return HttpResponse.json(body, { headers: body.status === "running" ? { "Retry-After": "1" } : {} });
    }),
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
