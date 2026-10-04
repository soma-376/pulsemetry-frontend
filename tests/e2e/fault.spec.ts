import type { Page, Route } from "@playwright/test";
import { allowHttpErrors, dashboardBase, expect, test, seedOrganizations } from "./fixtures";
import { authenticatedRequest, seedPeriod, selectPeriod, signIn } from "./helpers";

// 장애 주입(@fault) — 실서버 앞에 page.route 로 한 종류의 응답만 바꾼다. 어떤 요청을 바꿨는지 시험 이름에 적는다. 나머지 요청은 실제 서버로 간다.
// 기대: 일시 장애(5xx·연결 실패)는 다시 시도하고 그 뒤 안내(다시 시도·다시 조회)로 복구, snapshot 만료(409)는 처음 쪽부터 한 번 다시 읽는다(대시보드 명세 §1).
const [A] = seedOrganizations;
const O = `/api/v1/organizations/${A.id}`;

function cors(page: Page) {
  const origin = new URL(page.url() || dashboardBase()).origin;
  return { "access-control-allow-origin": origin, "access-control-expose-headers": "Retry-After", "content-type": "application/json" };
}
const error = (route: Route, page: Page, status: number, code: string, headers: Record<string, string> = {}) =>
  route.fulfill({ status, headers: { ...cors(page), ...headers }, body: JSON.stringify({ error: { code, message: "injected", fieldErrors: [] }, requestId: "e2e-fault" }) });
const dashboard = (path: RegExp) => (url: URL) => url.origin === new URL(dashboardBase()).origin && path.test(url.pathname);

test("FAULT-OVERVIEW-503 @p1 @fault (개요 조회를 503 으로 바꿈) 일시 장애는 다시 시도한 뒤 안내하고 저절로 더 부르지 않으며, 서버가 돌아오면 다시 시도로 회복한다", async ({ page }) => {
  allowHttpErrors({ status: 503, path: /\/analytics\/overview\?/, method: "GET", reason: "주입한 일시 장애" });
  await signIn(page, `owner@seed-${A.seed}.example.test`);
  let failing = true;
  const attempts = new Map<string, number>();
  await page.route(dashboard(/\/analytics\/overview(?:\?.*)?$/), async (route) => {
    if (route.request().method() !== "GET" || !failing) return route.continue();
    attempts.set(route.request().url(), (attempts.get(route.request().url()) ?? 0) + 1);
    return error(route, page, 503, "unavailable", { "Retry-After": "1" });
  });
  await page.reload();
  const main = page.getByRole("main");
  // 개요는 조회 실패 안내에 "다시 시도"를 둔다.
  const retry = page.getByRole("alert").filter({ hasText: "개요 서버에 연결할 수 없습니다" }).getByRole("button", { name: "다시 시도", exact: true });
  await expect(retry.first()).toBeVisible({ timeout: 30_000 });
  // 한 번에 끝내지 않는다 — 일시 장애는 다시 시도했다. 안내를 보인 뒤로는 저절로 다시 부르지 않는다(끝없는 재시도가 아니다).
  const total = () => [...attempts.values()].reduce((sum, count) => sum + count, 0);
  expect(Math.max(...attempts.values())).toBeGreaterThanOrEqual(2);
  const shown = total();
  await page.waitForTimeout(5_000);
  expect(total(), `안내 뒤 추가 요청 — ${JSON.stringify([...attempts.values()])}`).toBe(shown);
  await expect(main.getByRole("region", { name: "사용 관측 인원", exact: true })).toHaveCount(0);
  failing = false;
  await retry.first().click();
  await expect(main.getByRole("region", { name: "사용 관측 인원", exact: true })).toBeVisible();
  await expect(retry).toHaveCount(0);
});

test("FAULT-TEAMS-409 @p1 @fault (팀 분석의 다음 쪽 조회를 409 snapshot_expired 로 한 번 바꿈, limit 2) snapshot 이 만료되면 처음 쪽부터 한 번 다시 읽어 팀 전부를 보인다", async ({ page }) => {
  allowHttpErrors({ status: 409, path: /\/analytics\/teams\?/, method: "GET", reason: "주입한 snapshot 만료" });
  await signIn(page, `owner@seed-${A.seed}.example.test`);
  const { start, end } = seedPeriod();
  const teams = (await authenticatedRequest(page, dashboardBase(), `${O}/analytics/teams?startDate=${start}&endDate=${end}&timeZone=Asia/Seoul&limit=50`)).body.teams.items as { teamName: string }[];
  const sent: string[] = [];
  let injected = false;
  await page.route(dashboard(/\/analytics\/teams(?:\?.*)?$/), async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET" || url.searchParams.get("startDate") !== start) return route.continue();
    url.searchParams.set("limit", "2");
    sent.push(url.searchParams.has("cursor") ? "next" : "first");
    if (url.searchParams.has("cursor") && !injected) {
      injected = true;
      return error(route, page, 409, "snapshot_expired");
    }
    return route.continue({ url: url.toString() });
  });
  await page.goto("/teams");
  await selectPeriod(page, start, end);
  const axis = page.getByRole("region", { name: "팀별 사용량 비교", exact: true });
  for (const team of teams) await expect(axis).toContainText(team.teamName);
  // 첫 쪽 → 다음 쪽(만료) → 다시 첫 쪽부터.
  expect(sent.slice(0, 3)).toEqual(["first", "next", "first"]);
  await expect(page.getByRole("main").getByRole("button", { name: "다시 조회", exact: true })).toHaveCount(0);
});

test("FAULT-SETTINGS-NETWORK @p1 @fault (설정 조회를 연결 실패로 바꿈) 연결 실패는 다시 시도한 뒤 다시 조회 안내이고, 연결이 돌아오면 회복한다", async ({ page }) => {
  await signIn(page, `owner@seed-${A.seed}.example.test`);
  let failing = true, aborted = 0;
  await page.route(dashboard(new RegExp(`^${O}/settings$`)), async (route) => {
    if (route.request().method() !== "GET" || !failing) return route.continue();
    aborted++;
    return route.abort("failed");
  });
  await page.goto("/settings");
  const main = page.getByRole("main");
  const retry = main.getByRole("button", { name: "다시 조회", exact: true });
  await expect(retry.first()).toBeVisible({ timeout: 30_000 });
  expect(aborted).toBeGreaterThanOrEqual(2);
  failing = false;
  await retry.first().click();
  await expect(main.getByRole("heading", { name: "설정", exact: true })).toBeVisible();
  await expect(main.getByRole("button", { name: /계약 설정 열기$/ }).first()).toBeVisible();
  await expect(retry).toHaveCount(0);
});
