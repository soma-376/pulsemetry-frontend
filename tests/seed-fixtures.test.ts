import assert from "node:assert/strict";
import test from "node:test";
import { COMPANY_A, COMPANY_A_ONBOARDING, COMPANY_A_VENDORS, SEED_CATALOG } from "../src/mocks/company-a";
import { catalogPlansSchema } from "../src/lib/api/vendor-catalog";
import { managedVendorSchema, onboardingSchema } from "../src/lib/api/management";
import { VENDOR_CATALOG } from "../src/lib/vendor-catalog";

test("A fixture는 완료 조직이며 좌석 계약과 관측 인원을 연결하지 않는다", () => {
  assert.equal(COMPANY_A.organization.organizationId, "1b59ab21-1788-35e0-bfd7-23baa88a35b4");
  assert.equal(onboardingSchema.parse(COMPANY_A_ONBOARDING).completed, true);
  assert.equal(COMPANY_A.members.filter(member => member.status === "active").length, 12);
  assert.equal(COMPANY_A.usage.activeUsers, 8);
  assert.deepEqual(COMPANY_A.teams.map(team => team.teamName), ["플랫폼", "제품", "데이터", "디자인"]);
  const claude = COMPANY_A_VENDORS.map(vendor => managedVendorSchema.parse(vendor)).find(vendor => vendor.kind === "claude_team")!;
  assert.equal(claude.contract?.planId, "team");
  assert.equal(claude.contract?.monthlySeatFeeUsd, "360");
  // 시드 A 명세: OpenAI는 최초 미입력(v1) 뒤 관리자가 Business 두 좌석 유형(월 $400)을 입력했다(v2). Cursor는 계약 미입력이다.
  const openai = managedVendorSchema.parse(COMPANY_A_VENDORS.find(vendor => vendor.kind === "openai_biz")!);
  assert.equal(openai.version, 2);
  assert.equal(openai.contract?.planId, "business");
  assert.equal(openai.contract?.monthlySeatFeeUsd, "400");
  assert.deepEqual(COMPANY_A_VENDORS.map(vendor => vendor.kind).sort(), ["claude_team", "copilot", "cursor", "openai_biz"]);
  assert.equal(COMPANY_A_VENDORS.find(vendor => vendor.kind === "cursor")!.contract, null);
  assert.ok(COMPANY_A.managedVendors.every(vendor => vendor.activeUsers7d === null));
  assert.equal(COMPANY_A.legacyContracts.find(contract => contract.provider === "openai")!.commitmentAmountUsd, "0");
});

test("A fixture의 정책 적용 현황은 판 2 기준 적용 7 · 미적용 3 · 미확인 1이고 적용하지 않은 설치만 안내할 수 있다", () => {
  assert.deepEqual(COMPANY_A.policyRollout, { desiredVersion: 2, eligible: 11, applied: 7, outdated: 3, unknown: 1 });
  assert.equal(COMPANY_A_ONBOARDING.policy.version, 2);
  const installations = COMPANY_A.installations;
  assert.equal(installations.length, 11);
  assert.equal(installations.filter(row => row.appliedPolicyVersion === 2).length, 7);
  assert.equal(installations.filter(row => row.appliedPolicyVersion === 1).length, 3);
  const unknown = installations.filter(row => row.appliedPolicyVersion === null);
  assert.equal(unknown.length, 1);
  // 미확인 설치는 보고한 적이 없다. 나머지는 기준 시각(기준일의 서울 자정)에 마지막으로 보고했다.
  assert.equal(unknown[0].lastHeartbeatAt, null);
  assert.ok(installations.filter(row => row.appliedPolicyVersion !== null).every(row => row.lastHeartbeatAt === "2026-09-27T15:00:00Z"));
  assert.deepEqual(installations.filter(row => row.canNotify).map(row => row.appliedPolicyVersion).sort(), [1, 1, 1, null]);
});

test("Storybook과 로컬 표시 카탈로그는 서버 제품·플랜 ID를 사용한다", () => {
  for (const product of SEED_CATALOG.items) {
    catalogPlansSchema.parse({ catalogVersion: SEED_CATALOG.catalogVersion, vendor: product, plans: SEED_CATALOG.plans[product.id] });
    const local = VENDOR_CATALOG.find(vendor => vendor.kind === product.id)!;
    assert.deepEqual(local.plans.map(plan => plan.v), SEED_CATALOG.plans[product.id].map(plan => plan.id));
  }
  assert.ok(SEED_CATALOG.plans.openai_biz.some(plan => plan.id === "business"));
  assert.ok(SEED_CATALOG.plans.claude_team.some(plan => plan.id === "team"));
  assert.equal(SEED_CATALOG.items.some(product => product.id === "codex"), false);
  assert.equal(SEED_CATALOG.items.find(product => product.id === "openai_biz")!.allowsSeatTiers, true);
});

test("프론트 공개 fixture에 비밀번호·초대 코드·인증 토큰을 포함하지 않는다", () => {
  const data = JSON.stringify(COMPANY_A);
  assert.doesNotMatch(data, /password|code_hash|invitation_codes|access_token|refresh_token/i);
});


test("단계별 Storybook은 A 원본을 보존하고 서버에 없는 플랜을 거절한다", async () => {
  const { setupServer } = await import("msw/node");
  const { onboardingHandlers } = await import("../.storybook/fixtures/onboarding");
  const server = setupServer(...onboardingHandlers("teams"));
  server.listen({ onUnhandledRequest: "error" });
  const base = `http://fixture.invalid/api/v1/organizations/${COMPANY_A.organization.organizationId}`;
  try {
    const state = await (await fetch(`${base}/onboarding`)).json();
    assert.equal(state.completed, false);
    assert.equal(COMPANY_A_ONBOARDING.completed, true);
    const before = await (await fetch(`${base}/vendors`)).json();
    assert.equal(before.vendors.items.length, 4);
    // 등록하지 않은 제품에 다른 제품의 플랜을 보내면 거절한다.
    const rejected = await fetch(`${base}/vendors`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "gemini", displayName: "잘못된 플랜", contract: { planId: "claude_team" } }),
    });
    assert.equal(rejected.status, 422);
    const duplicate = await fetch(`${base}/vendors`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "claude_team", displayName: "중복" }) });
    assert.equal(duplicate.status, 409);
    await fetch(`${base}/vendors/${COMPANY_A_VENDORS[0].vendorId}`, { method: "DELETE" });
    assert.equal(COMPANY_A_VENDORS.length, 4);
    server.resetHandlers(...onboardingHandlers("teams"));
    assert.equal((await (await fetch(`${base}/vendors`)).json()).vendors.items.length, 4);
  } finally {
    server.close();
  }
});
