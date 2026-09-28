import { expect, test } from "@playwright/test";
import { currentDateIso } from "../../src/lib/date";

test("ONBOARDING-CATALOG @write 실제 카탈로그, 계약 없는 등록, 멱등 재시도, 계약 추가·삭제", async ({ page }) => {
  const dashboard = process.env.NEXT_PUBLIC_DASHBOARD_API_URL ?? "http://localhost:8081";
  await page.goto("/login");
  await page.getByLabel("회사 이메일", { exact: true }).fill("owner@seed-b.example.test");
  const onboarding = page.waitForResponse(r => r.url().endsWith("/onboarding") && r.request().method() === "GET");
  await page.getByRole("button", { name: "회사 계정으로 계속", exact: true }).click();
  const stateResponse = await onboarding;
  expect(stateResponse.status()).toBe(200);
  const initial = await stateResponse.json();
  const enrollment = new URL(stateResponse.url()).origin;
  const orgPath = `/api/v1/organizations/${initial.organizationId}`;
  const request = (origin: string, path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) => page.evaluate(async ({ origin, path, method, body, headers }) => {
    const session = JSON.parse(sessionStorage.getItem("pulsemetry.seed-session.v1")!);
    const response = await fetch(origin + path, { method, headers: { Authorization: `Bearer ${session.tokens.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  }, { origin, path, method, body, headers });
  const catalog = await request(dashboard, "/api/v1/vendor-catalog?limit=100");
  expect(catalog.status).toBe(200);
  expect(catalog.body.items.some((v: { provider: string }) => v.provider === "anthropic")).toBe(true);
  const product = catalog.body.items.find((v: { id: string }) => v.id === "claude_team");
  const plans = await request(dashboard, `/api/v1/vendor-catalog/${product.id}/plans`);
  expect(plans.status).toBe(200);
  const body = { kind: product.id, displayName: `E2E-${crypto.randomUUID()}` };
  const key = { "Idempotency-Key": crypto.randomUUID() };
  let vendor: { vendorId: string; version: number } | undefined;
  try {
    const created = await request(enrollment, `${orgPath}/vendors`, "POST", body, key);
    expect(created.status).toBe(201);
    vendor = created.body.vendor;
    expect(created.body.vendor.contract).toBeNull();
    expect(created.body.vendor.state).toBe("needs_review");
    const repeated = await request(enrollment, `${orgPath}/vendors`, "POST", body, key);
    expect(repeated.status).toBe(201);
    expect(repeated.body.vendor.vendorId).toBe(vendor!.vendorId);
    const saved = await request(enrollment, `${orgPath}/vendors/${vendor!.vendorId}/contract`, "PUT", {
      expectedVersion: vendor!.version, displayName: body.displayName,
      contract: { planId: plans.body.plans[0].id, effectiveFrom: currentDateIso(), effectiveTo: null, termNote: null, tiers: [{ label: "표준", seats: 2, monthlyFeePerSeatUsd: "12.123456789012" }] },
    });
    expect(saved.status).toBe(200);
    vendor = saved.body.vendor;
    expect(saved.body.vendor.contract.tiers[0].monthlyFeePerSeatUsd).toBe("12.123456789012");
    expect(saved.body.vendor.contract.monthlySeatFeeUsd).toBe("24.246913578024");
    const listed = await request(dashboard, `${orgPath}/vendors?limit=100`);
    expect(listed.status).toBe(200);
    expect(listed.body.vendors.items.filter((v: { vendorId: string }) => v.vendorId === vendor!.vendorId)).toHaveLength(1);
  } finally {
    if (vendor) {
      const deleted = await request(enrollment, `${orgPath}/vendors/${vendor.vendorId}`, "DELETE", undefined, { "If-Match": `"vendor-${vendor.version}"` });
      expect(deleted.status).toBe(204);
    }
    const after = await request(enrollment, `${orgPath}/onboarding`);
    expect(after.body).toEqual(initial);
    await page.getByRole("link", { name: "로그아웃", exact: true }).click();
  }
});
