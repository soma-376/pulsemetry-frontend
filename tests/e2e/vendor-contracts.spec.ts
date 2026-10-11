import {
  expect,
  test,
  dashboardBase,
  enrollmentBase,
  seedOrganizations,
} from "./fixtures";
import { authenticatedRequest, signIn } from "./helpers";
import { PreparationError } from "./harness";
import { currentDateIso } from "../../src/lib/date";

test("VENDOR-API @write 실제 서버: 등록·멱등 재시도와 설정 드로어 정정·이름 변경·계약 비우기·삭제", async ({
  page,
}) => {
  const dashboard = dashboardBase(),
    enrollment = enrollmentBase();
  await signIn(page, "owner@seed-a.example.test");
  const orgPath = `/api/v1/organizations/${seedOrganizations[0].id}`;
  const request = (
    origin: string,
    path: string,
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
  ) => authenticatedRequest(page, origin, path, method, body, headers);
  const state = await request(enrollment, `${orgPath}/onboarding`);
  expect(state.status).toBe(200);
  const initial = state.body;
  const catalog = await request(dashboard, "/api/v1/vendor-catalog?limit=100");
  expect(catalog.status).toBe(200);
  expect(
    catalog.body.items.some(
      (v: { provider: string }) => v.provider === "anthropic",
    ),
  ).toBe(true);
  const registered = await request(dashboard, `${orgPath}/vendors?limit=100`);
  expect(registered.status).toBe(200);
  type Registered = {
    vendorId: string;
    kind: string;
    displayName: string;
    version: number;
  };
  const items = registered.body.vendors.items as Registered[];
  let product = catalog.body.items.find(
    (v: { id: string }) => !items.some((item) => item.kind === v.id),
  );
  if (!product) {
    // 자원 준비: 등록 가능한 제품이 없으면 이전 실행이 남긴 E2E 벤더를 보관해 그 제품 자리를 비운다(보관한 등록은 같은 제품의 새 등록을 막지 않는다).
    // 시드가 등록한 제품은 건드리지 않는다. 비울 것이 없으면 건너뛰지 않고 준비 실패로 끝낸다.
    const leftover = items.find((item) => item.displayName.startsWith("E2E-"));
    if (!leftover)
      throw new PreparationError(
        "시드 A 에 등록 가능한 제품이 없고 비울 수 있는 E2E 벤더도 없습니다 — 시드를 초기화하세요.",
      );
    const archived = await request(
      enrollment,
      `${orgPath}/vendors/${leftover.vendorId}`,
      "DELETE",
      undefined,
      { "If-Match": `"vendor-${leftover.version}"` },
    );
    if (archived.status !== 204)
      throw new PreparationError(
        `이전 실행의 E2E 벤더를 보관하지 못했습니다 — HTTP ${archived.status}`,
      );
    product = catalog.body.items.find(
      (v: { id: string }) => v.id === leftover.kind,
    );
  }
  const plans = await request(
    dashboard,
    `/api/v1/vendor-catalog/${product.id}/plans`,
  );
  expect(plans.status).toBe(200);
  const body = { kind: product.id, displayName: `E2E-${crypto.randomUUID()}` };
  const key = { "Idempotency-Key": crypto.randomUUID() };
  let vendor: { vendorId: string; version: number } | undefined;
  try {
    const created = await request(
      enrollment,
      `${orgPath}/vendors`,
      "POST",
      body,
      key,
    );
    expect(created.status).toBe(201);
    vendor = created.body.vendor;
    expect(created.body.vendor.contract).toBeNull();
    expect(created.body.vendor.state).toBe("needs_review");
    const repeated = await request(
      enrollment,
      `${orgPath}/vendors`,
      "POST",
      body,
      key,
    );
    expect(repeated.status).toBe(201);
    expect(repeated.body.vendor.vendorId).toBe(vendor!.vendorId);
    const saved = await request(
      enrollment,
      `${orgPath}/vendors/${vendor!.vendorId}/contract`,
      "PUT",
      {
        expectedVersion: vendor!.version,
        displayName: body.displayName,
        contract: {
          planId: plans.body.plans[0].id,
          effectiveFrom: currentDateIso(),
          effectiveTo: null,
          termNote: null,
          tiers: [
            {
              label: "표준",
              seats: 2,
              monthlyFeePerSeatUsd: "12.123456789012",
            },
          ],
        },
      },
    );
    expect(saved.status).toBe(200);
    vendor = saved.body.vendor;
    expect(saved.body.vendor.contract.tiers[0].monthlyFeePerSeatUsd).toBe(
      "12.123456789012",
    );
    expect(saved.body.vendor.contract.monthlySeatFeeUsd).toBe(
      "24.246913578024",
    );
    const listed = await request(dashboard, `${orgPath}/vendors?limit=100`);
    expect(listed.status).toBe(200);
    expect(
      listed.body.vendors.items.filter(
        (v: { vendorId: string }) => v.vendorId === vendor!.vendorId,
      ),
    ).toHaveLength(1);

    await page.goto("/settings");
    await page
      .getByRole("button", {
        name: `${body.displayName} 계약 설정 열기`,
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", { name: "변경사항 저장", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("textbox", { name: "월 단가", exact: true })
      .fill("15.123456789012");
    const correction = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/vendors/${vendor!.vendorId}/contract`) &&
        r.request().method() === "PUT",
    );
    await page
      .getByRole("button", { name: "변경사항 저장", exact: true })
      .click();
    const correctionResponse = await correction;
    expect(correctionResponse.status()).toBe(200);
    const corrected = (await correctionResponse.json()).vendor;
    expect(corrected.contract.effectiveFrom).toBe(
      saved.body.vendor.contract.effectiveFrom,
    );
    expect(corrected.contract.monthlySeatFeeUsd).toBe("30.246913578024");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page
      .getByRole("button", {
        name: `${body.displayName} 계약 설정 열기`,
        exact: true,
      })
      .click();
    const renamedName = `${body.displayName}-정정`;
    await page
      .getByRole("textbox", { name: "표시 이름", exact: true })
      .fill(renamedName);
    const rename = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/vendors/${vendor!.vendorId}`) &&
        r.request().method() === "PATCH",
    );
    await page
      .getByRole("button", { name: "변경사항 저장", exact: true })
      .click();
    const renameResponse = await rename;
    expect(renameResponse.status()).toBe(200);
    expect((await renameResponse.json()).vendor.contract).toEqual(
      corrected.contract,
    );
    body.displayName = renamedName;
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page
      .getByRole("button", {
        name: `${body.displayName} 계약 설정 열기`,
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "계약 비우기", exact: true })
      .click();
    await page
      .getByRole("button", { name: "계약 비우기 확인", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const cleared = await request(
      dashboard,
      `${orgPath}/vendors/${vendor!.vendorId}`,
    );
    expect(cleared.status).toBe(200);
    expect(cleared.body.vendor.contract).toBeNull();

    await page
      .getByRole("button", {
        name: `${body.displayName} 계약 설정 열기`,
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "벤더 삭제", exact: true }).click();
    await page
      .getByRole("button", { name: "제품 삭제 확인", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: `${body.displayName} 계약 설정 열기`,
        exact: true,
      }),
    ).toHaveCount(0);
  } finally {
    if (vendor) {
      const latest = await request(
        dashboard,
        `${orgPath}/vendors/${vendor.vendorId}`,
      );
      expect([200, 404]).toContain(latest.status);
      if (latest.status === 200) {
        expect(latest.body.vendor.displayName).toMatch(/^E2E-/);
        const deleted = await request(
          enrollment,
          `${orgPath}/vendors/${vendor.vendorId}`,
          "DELETE",
          undefined,
          { "If-Match": `"vendor-${latest.body.vendor.version}"` },
        );
        expect(deleted.status).toBe(204);
      }
      const remaining = await request(
        dashboard,
        `${orgPath}/vendors?limit=100`,
      );
      expect(remaining.status).toBe(200);
      expect(
        remaining.body.vendors.items.some(
          (item: { vendorId: string }) => item.vendorId === vendor!.vendorId,
        ),
      ).toBe(false);
    }
    const after = await request(enrollment, `${orgPath}/onboarding`);
    expect(after.body).toEqual(initial);
  }
});
