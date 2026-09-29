import { expect, test, dashboardBase } from "./fixtures";
import { authenticatedRequest, signOut } from "./helpers";
import { currentDateIso } from "../../src/lib/date";

test("VENDOR-API @write 실제 서버: 등록·멱등 재시도와 설정 드로어 정정·이름 변경·계약 비우기·삭제", async ({ page }) => {
  const dashboard = dashboardBase();
  await page.goto("/login");
  await page.getByLabel("회사 이메일", { exact: true }).fill("owner@seed-a.example.test");
  const onboarding = page.waitForResponse(r => r.url().endsWith("/onboarding") && r.request().method() === "GET");
  await page.getByRole("button", { name: "회사 계정으로 계속", exact: true }).click();
  const stateResponse = await onboarding;
  expect(stateResponse.status()).toBe(200);
  const initial = await stateResponse.json();
  await expect(page).toHaveURL(/\/(onboarding|overview)$/);
  const enrollment = new URL(stateResponse.url()).origin;
  const orgPath = `/api/v1/organizations/${initial.organizationId}`;
  const request = (origin: string, path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) => authenticatedRequest(page, origin, path, method, body, headers);
  const catalog = await request(dashboard, "/api/v1/vendor-catalog?limit=100");
  expect(catalog.status).toBe(200);
  expect(catalog.body.items.some((v: { provider: string }) => v.provider === "anthropic")).toBe(true);
  const registered = await request(dashboard, `${orgPath}/vendors?limit=100`);
  expect(registered.status).toBe(200);
  const product = catalog.body.items.find((v: { id: string }) => !registered.body.vendors.items.some((item: { kind: string }) => item.kind === v.id));
  test.skip(!product, "모든 제품이 등록되어 있어 기존 시드를 보존하기 위해 쓰기 테스트를 건너뜁니다.");
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

    await page.goto("/settings");
    await page.getByRole("button", { name: `${body.displayName} 계약 설정 열기`, exact: true }).click();
    await expect(page.getByRole("button", { name: "변경사항 저장", exact: true })).toBeDisabled();
    await page.getByRole("textbox", { name: "월 단가", exact: true }).fill("15.123456789012");
    const correction = page.waitForResponse(r => r.url().endsWith(`/vendors/${vendor!.vendorId}/contract`) && r.request().method() === "PUT");
    await page.getByRole("button", { name: "변경사항 저장", exact: true }).click();
    const correctionResponse = await correction;
    expect(correctionResponse.status()).toBe(200);
    const corrected = (await correctionResponse.json()).vendor;
    expect(corrected.contract.effectiveFrom).toBe(saved.body.vendor.contract.effectiveFrom);
    expect(corrected.contract.monthlySeatFeeUsd).toBe("30.246913578024");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: `${body.displayName} 계약 설정 열기`, exact: true }).click();
    const renamedName = `${body.displayName}-정정`;
    await page.getByRole("textbox", { name: "표시 이름", exact: true }).fill(renamedName);
    const rename = page.waitForResponse(r => r.url().endsWith(`/vendors/${vendor!.vendorId}`) && r.request().method() === "PATCH");
    await page.getByRole("button", { name: "변경사항 저장", exact: true }).click();
    const renameResponse = await rename;
    expect(renameResponse.status()).toBe(200);
    expect((await renameResponse.json()).vendor.contract).toEqual(corrected.contract);
    body.displayName = renamedName;
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: `${body.displayName} 계약 설정 열기`, exact: true }).click();
    await page.getByRole("button", { name: "계약 비우기", exact: true }).click();
    await page.getByRole("button", { name: "계약 비우기 확인", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const cleared = await request(dashboard, `${orgPath}/vendors/${vendor!.vendorId}`);
    expect(cleared.status).toBe(200);
    expect(cleared.body.vendor.contract).toBeNull();

    await page.getByRole("button", { name: `${body.displayName} 계약 설정 열기`, exact: true }).click();
    await page.getByRole("button", { name: "벤더 삭제", exact: true }).click();
    await page.getByRole("button", { name: "제품 삭제 확인", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: `${body.displayName} 계약 설정 열기`, exact: true })).toHaveCount(0);

  } finally {
    if (vendor) {
      const latest = await request(dashboard, `${orgPath}/vendors/${vendor.vendorId}`);
      expect([200, 404]).toContain(latest.status);
      if (latest.status === 200) {
        expect(latest.body.vendor.displayName).toMatch(/^E2E-/);
        const deleted = await request(enrollment, `${orgPath}/vendors/${vendor.vendorId}`, "DELETE", undefined, { "If-Match": `"vendor-${latest.body.vendor.version}"` });
        expect(deleted.status).toBe(204);
      }
      const remaining = await request(dashboard, `${orgPath}/vendors?limit=100`);
      expect(remaining.status).toBe(200);
      expect(remaining.body.vendors.items.some((item: { vendorId: string }) => item.vendorId === vendor!.vendorId)).toBe(false);
    }
    const after = await request(enrollment, `${orgPath}/onboarding`);
    expect(after.body).toEqual(initial);
    await signOut(page);
  }
});
