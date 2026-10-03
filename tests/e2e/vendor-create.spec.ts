import { dashboardBase, expect, test } from "./fixtures";
import { authenticatedRequest, signIn } from "./helpers";
import { PreparationError } from "./harness";

// 벤더 추가를 화면으로 — 카탈로그(서버 대시보드 명세 §3: limit·cursor 페이지)의 등록하지 않은 제품만 고르고, 플랜은 그 제품의 것만, 제품을 바꾸면 고른 플랜을 비우며,
// 첫 계약을 저장하면 새로고침 뒤에도 남는다. 화면에는 검색 입력이 없다 — 목록 전체를 cursor 로 이어 읽어 선택지로 둔다.
// fresh 조직 E 를 바꾼다(시드 A·B·C 의 등록 제품을 바꾸지 않는다). 끝에 화면으로 지워 다시 돌릴 수 있게 한다.
const E = { seed: "e", id: "bd6fe5c2-6fdd-3433-b77e-5d5334b0bb8e" };
const O = `/api/v1/organizations/${E.id}`;
const KIND = "openai_biz";
const NAME = "ChatGPT Business (E2E)";

test("VENDOR-UI-E @p1 @write 벤더 추가 창은 cursor 로 이은 카탈로그에서 등록하지 않은 제품만 고르게 하고, 제품을 바꾸면 플랜을 비우며, 첫 계약 저장이 새로고침 뒤에도 남고 삭제하면 사라진다", async ({ page }) => {
  await signIn(page, `owner@seed-${E.seed}.example.test`);
  const request = (path: string) => authenticatedRequest(page, dashboardBase(), path);
  const catalog: string[] = [];
  let cursor: string | null = null;
  do {
    const query: string = new URLSearchParams({ limit: "100", ...(cursor ? { cursor } : {}) }).toString();
    const pageBody = (await request(`/api/v1/vendor-catalog?${query}`)).body as { items: { id: string }[]; nextCursor: string | null };
    catalog.push(...pageBody.items.map((item) => item.id));
    cursor = pageBody.nextCursor;
  } while (cursor);
  const registered = ((await request(`${O}/settings`)).body.vendors.items as { kind: string }[]).map((vendor) => vendor.kind);
  if (registered.includes(KIND)) throw new PreparationError(`조직 E 에 ${KIND} 가 이미 등록돼 있습니다 — 앞 실행이 남긴 것이면 설정에서 지우세요.`);
  const plans = ((await request(`/api/v1/vendor-catalog/${KIND}/plans`)).body.plans as { id: string }[]).map((plan) => plan.id);

  await page.goto("/settings");
  await page.getByRole("button", { name: "벤더 추가", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "벤더 추가", exact: true });
  const product = dialog.getByLabel("제품", { exact: true });
  const plan = dialog.getByLabel("플랜", { exact: true });
  const values = async (select: typeof product) => (await select.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).filter(Boolean).sort();
  // 선택지는 카탈로그 전부(모든 cursor 페이지)에서 이미 등록한 제품을 뺀 것이다.
  await expect.poll(() => values(product)).toEqual(catalog.filter((id) => !registered.includes(id)).sort());

  // 플랜은 고른 제품의 것만. 제품을 바꾸면 고른 플랜을 비운다.
  await product.selectOption(KIND);
  await expect.poll(() => values(plan)).toEqual([...plans].sort());
  await plan.selectOption(plans[0]);
  const other = (await values(product)).find((id) => id !== KIND && id !== "other");
  if (!other) throw new PreparationError("고를 수 있는 다른 제품이 없습니다.");
  await product.selectOption(other);
  await expect(plan).toHaveValue("");
  await product.selectOption(KIND);
  await expect(plan).toHaveValue("");
  await plan.selectOption(plans[0]);
  await dialog.getByLabel("표시 이름", { exact: true }).fill(NAME);
  await dialog.getByLabel("좌석 유형", { exact: true }).fill("Standard");
  await dialog.getByLabel("좌석 수", { exact: true }).fill("3");
  await dialog.getByLabel("월 단가", { exact: true }).fill("25");
  const saved = page.waitForResponse((response) => response.url().endsWith(`${O}/vendors`) && response.request().method() === "POST");
  await dialog.getByRole("button", { name: "벤더 추가", exact: true }).click();
  expect((await saved).status()).toBe(201);
  await expect(page.getByRole("status").filter({ hasText: "벤더를 추가했습니다." })).toBeVisible();

  // 서버 값 — 계약 시작일은 등록일, 등급·좌석·단가는 입력 그대로.
  const vendor = ((await request(`${O}/settings`)).body.vendors.items as { kind: string; vendorId: string; displayName: string; contract: { planId: string; tiers: { label: string; seats: number; monthlyFeePerSeatUsd: string }[] } | null }[])
    .find((item) => item.kind === KIND)!;
  expect(vendor.displayName).toBe(NAME);
  expect(vendor.contract?.planId).toBe(plans[0]);
  expect(vendor.contract?.tiers.map((tier) => [tier.label, tier.seats, Number(tier.monthlyFeePerSeatUsd)])).toEqual([["Standard", 3, 25]]);

  await page.reload();
  await page.getByRole("button", { name: `${NAME} 계약 설정 열기`, exact: true }).click();
  const drawer = page.getByRole("dialog", { name: `${NAME} 계약 설정`, exact: true });
  await expect(drawer.getByLabel("플랜", { exact: true })).toHaveValue(plans[0]);
  await expect(drawer.getByLabel("좌석 수", { exact: true })).toHaveValue("3");

  // 지우면 목록에서 사라지고, 지운 제품의 조회를 다시 부르지 않는다(기대하지 않은 404 가 있으면 이 시험이 실패한다).
  await drawer.getByRole("button", { name: "벤더 삭제", exact: true }).click();
  await drawer.getByRole("button", { name: "제품 삭제 확인", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "벤더를 삭제했습니다." })).toBeVisible();
  await expect(page.getByRole("button", { name: `${NAME} 계약 설정 열기`, exact: true })).toHaveCount(0);
  expect(((await request(`${O}/settings`)).body.vendors.items as { kind: string }[]).some((item) => item.kind === KIND)).toBe(false);
});
