import { expect, test, type Page } from "@playwright/test";
import { mockSession } from "./helpers";
import {
  mockOverview,
  ingestStatusUrl,
  testOrganizationId,
} from "./overview-fixture";
import type { TransmissionLoss } from "../../src/lib/api/ingest-status";

const loss: TransmissionLoss = {
  payloadCount: 10,
  affectedInstallationCount: 2,
  windowStart: "2026-10-28T00:00:00Z",
  windowEnd: "2026-11-04T00:00:00Z",
  availableFrom: "2026-10-28T00:00:00Z",
  availability: "complete",
  reasons: [],
};
const status = (value?: TransmissionLoss) => ({
  organizationId: testOrganizationId,
  status: "down",
  reason: "installations_silent",
  asOf: loss.windowEnd,
  lastReceivedAt: "2026-10-27T00:00:00Z",
  transmissionLoss: value,
});
const affected = (cursor: string | null) => ({
  meta: {
    organizationId: testOrganizationId,
    snapshotId: "loss-snapshot",
    asOf: loss.windowEnd,
  },
  windowStart: loss.windowStart,
  windowEnd: loss.windowEnd,
  installations: {
    items: [
      {
        installationId: cursor ? "installation-b" : "installation-a",
        deviceName: cursor ? "폐기 기기" : "개발 노트북",
        memberId: "member-a",
        account: "member@example.test",
        payloadCount: cursor ? 3 : 7,
        lastObservedAt: "2026-11-03T00:00:00Z",
        status: cursor ? "revoked" : "active",
      },
    ],
    totalCount: 2,
    nextCursor: cursor ? null : "next",
  },
});
async function prepare(page: Page, value?: TransmissionLoss) {
  await mockSession(page);
  await mockOverview(page);
  await page.route(ingestStatusUrl, (route) =>
    route.fulfill({ json: status(value) }),
  );
}

test("헤더 최초 조회는 로딩·실패·재시도를 0건과 구분한다", async ({ page }) => {
  await prepare(page, loss);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let failed = true;
  await page.route(ingestStatusUrl, async (route) => {
    await gate;
    return route.fulfill(
      failed
        ? { status: 503, json: { error: { code: "unavailable" } } }
        : { json: status(loss) },
    );
  });
  await page.goto("/overview");
  const bar = page.getByLabel("조직 수집 현황", { exact: true });
  await expect(bar).toContainText("전송 손실 확인 중");
  release();
  await expect(bar).toContainText("전송 손실을 불러오지 못했습니다");
  await expect(bar).not.toContainText("0건");
  failed = false;
  await bar.getByRole("button", { name: "다시 조회" }).click();
  await expect(bar).toContainText("최근 7일 전송 손실 10건");
});

test("현재 전송 상태 조회 실패가 독립적인 손실 수량을 덮어쓰지 않는다", async ({
  page,
}) => {
  await prepare(page, loss);
  await page.route(ingestStatusUrl, (route) =>
    route.fulfill({
      json: {
        ...status(loss),
        status: "unknown",
        reason: "source_query_failed",
        lastReceivedAt: null,
      },
    }),
  );
  await page.route("**/ingest-status/loss-installations?*", (route) =>
    route.fulfill({ json: affected(null) }),
  );
  await page.goto("/overview");
  await page.getByRole("button", { name: /최근 7일 전송 손실 10건/ }).click();
  const drawer = page.getByRole("dialog", { name: "전송 손실" });
  await expect(drawer.getByLabel("전송 손실 집계")).toContainText("10건");
  await expect(
    page.getByLabel("조직 수집 현황", { exact: true }),
  ).toContainText("수집 상태 확인 불가");
  await expect(drawer).toContainText("개발 노트북");
});

for (const width of [1440, 390])
  test(`손실 상세는 고정된 168시간 창의 기기·폐기 상태를 보여 주고 키보드로 닫는다 (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await prepare(page, loss);
    const requests: string[] = [];
    await page.route("**/ingest-status/loss-installations?*", (route) => {
      const query = new URL(route.request().url()).searchParams;
      requests.push(query.toString());
      expect(query.get("windowEnd")).toBe(loss.windowEnd);
      expect(
        query.has("startDate") || query.has("teamId") || query.has("vendor"),
      ).toBe(false);
      if (query.has("cursor"))
        expect(query.get("snapshotId")).toBe("loss-snapshot");
      return route.fulfill({ json: affected(query.get("cursor")) });
    });
    await page.goto(
      "/overview?startDate=2026-09-01&endDate=2026-09-07&compare=none",
    );
    const trigger = page.getByRole("button", {
      name: /최근 7일 전송 손실 10건/,
    });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const drawer = page.getByRole("dialog", { name: "전송 손실" });
    await expect(drawer).not.toContainText("데몬이 보고한");
    await expect(
      page.getByLabel("조직 수집 현황", { exact: true }),
    ).toContainText("보고 상태 미확인");
    await expect(drawer).not.toContainText("수집 중단");
    await expect(drawer).toContainText("개발 노트북");
    await drawer.getByRole("button", { name: "더 보기" }).click();
    await expect(drawer).toContainText("폐기 기기");
    await expect(drawer).toContainText("3건 · 폐기");
    expect(requests).toHaveLength(2);
    const section = drawer.locator("section").first();
    const bounds = await section.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

test("부분 집계의 제한과 갱신 실패를 표시하고 마지막 정상 수량을 유지한다", async ({
  page,
}) => {
  await prepare(page, {
    ...loss,
    availability: "partial",
    availableFrom: "2026-11-01T00:00:00Z",
    reasons: ["history_incomplete", "counter_decreased"],
  });
  await page.route("**/ingest-status/loss-installations?*", (route) =>
    route.fulfill({ json: affected(null) }),
  );
  await page.goto("/overview");
  const trigger = page.getByRole("button", {
    name: /최근 7일 전송 손실 10건 · 일부 집계/,
  });
  await expect(trigger).toContainText("일부 집계");
  await page.route(ingestStatusUrl, (route) =>
    route.fulfill({ status: 503, json: { error: { code: "unavailable" } } }),
  );
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(
    page.getByLabel("조직 수집 현황", { exact: true }),
  ).toContainText("갱신 실패", { timeout: 15000 });
  await expect(
    page.getByLabel("조직 수집 현황", { exact: true }),
  ).toContainText("마지막 수신: 2026년 10월 27일 09:00");
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "전송 손실" });
  await expect(drawer).toContainText("같은 실행의 손실 누계가 감소한 보고");
  await expect(drawer).toContainText("최근 7일 중 일부 기간부터 집계");
  await expect(drawer).toContainText("마지막으로 확인한 집계");
});

test("구버전 집계 정보 없음도 갱신 실패와 마지막 수신 시각을 유지한다", async ({
  page,
}) => {
  await prepare(page);
  await page.goto("/overview");
  const trigger = page.getByRole("button", { name: /집계 정보 없음/ });
  await expect(
    page.getByLabel("조직 수집 현황", { exact: true }),
  ).toContainText("마지막 수신: 2026년 10월 27일 09:00");
  await expect(trigger).toHaveCount(0);
  const headerHeight = (await page
    .getByLabel("공통 헤더", { exact: true })
    .boundingBox())!.height;
  await page.route(ingestStatusUrl, (route) =>
    route.fulfill({ status: 503, json: { error: { code: "unavailable" } } }),
  );
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(
    page.getByLabel("조직 수집 현황", { exact: true }),
  ).toContainText("갱신 실패");
  await expect(
    page.getByLabel("조직 수집 현황", { exact: true }),
  ).toContainText("마지막 수신: 2026년 10월 27일 09:00");
  await expect(trigger).toHaveCount(0);
  expect(
    (await page.getByLabel("공통 헤더", { exact: true }).boundingBox())!.height,
  ).toBe(headerHeight);
  await expect(page.getByRole("dialog", { name: "전송 손실" })).toHaveCount(0);
});

for (const scenario of [
  {
    name: "확인된 0",
    value: { ...loss, payloadCount: 0, affectedInstallationCount: 0 },
    label: "최근 7일 전송 손실 0건",
  },
  {
    name: "집계 불가",
    value: {
      ...loss,
      payloadCount: null,
      affectedInstallationCount: null,
      availability: "unavailable" as const,
      reasons: ["query_failed"],
    },
    label: "최근 7일 전송 손실 집계 불가",
  },
  { name: "구버전", value: undefined, label: "집계 정보 없음" },
])
  test(`${scenario.name} 응답을 다른 상태로 바꾸지 않는다`, async ({
    page,
  }) => {
    await prepare(page, scenario.value);
    await page.route("**/ingest-status/loss-installations?*", (route) =>
      route.fulfill({
        json: {
          ...affected(null),
          installations: { items: [], totalCount: 0, nextCursor: null },
        },
      }),
    );
    await page.goto("/overview");
    await expect(
      page.getByRole("button", { name: new RegExp(scenario.label) }),
    ).toHaveCount(scenario.name === "확인된 0" ? 1 : 0);
    if (scenario.name !== "확인된 0")
      await expect(
        page.getByText("최근 7일 전송 손실 0건", { exact: true }),
      ).toHaveCount(0);
  });

test("영향 기기 상세는 조회 중·실패에도 닫고 다시 시도할 수 있다", async ({
  page,
}) => {
  await prepare(page, loss);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let failed = true;
  await page.route("**/ingest-status/loss-installations?*", async (route) => {
    await gate;
    return route.fulfill(
      failed
        ? { status: 503, json: { error: { code: "unavailable" } } }
        : { json: affected(null) },
    );
  });
  await page.goto("/overview");
  const trigger = page.getByRole("button", {
    name: /최근 7일 전송 손실 10건/,
  });
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "전송 손실" });
  await expect(drawer).toContainText("영향 기기를 불러오는 중");
  await page.keyboard.press("Escape");
  release();
  await expect(drawer).not.toBeVisible();
  await trigger.click();
  await expect(drawer).toContainText("영향 기기를 불러오지 못했습니다", {
    timeout: 15000,
  });
  failed = false;
  await drawer.getByRole("button", { name: "다시 조회" }).click();
  await expect(drawer).toContainText("개발 노트북");
});

test("만료된 손실 기준은 요약을 다시 읽고 열린 상세에서 새 기준으로 복구한다", async ({
  page,
}) => {
  await prepare(page, loss);
  let summaryFails = true;
  let summaryRequests = 0;
  const newEnd = "2026-11-04T00:11:00Z";
  const nextLoss = {
    ...loss,
    payloadCount: 12,
    affectedInstallationCount: 1,
    windowStart: "2026-10-28T00:11:00Z",
    windowEnd: newEnd,
  };
  const windows: (string | null)[] = [];
  await page.route("**/ingest-status/loss-installations?*", (route) => {
    const end = new URL(route.request().url()).searchParams.get("windowEnd");
    windows.push(end);
    return route.fulfill(
      end === loss.windowEnd
        ? {
            status: 409,
            json: { error: { code: "snapshot_expired", message: "만료" } },
          }
        : {
            json: {
              ...affected(null),
              meta: {
                ...affected(null).meta,
                snapshotId: "new-snapshot",
                asOf: newEnd,
              },
              windowStart: nextLoss.windowStart,
              windowEnd: newEnd,
              installations: {
                items: [
                  {
                    ...affected(null).installations.items[0],
                    payloadCount: 12,
                  },
                ],
                totalCount: 1,
                nextCursor: null,
              },
            },
          },
    );
  });
  await page.goto("/overview");
  await page.getByRole("button", { name: /최근 7일 전송 손실 10건/ }).click();
  const drawer = page.getByRole("dialog", { name: "전송 손실" });
  await expect(drawer).toContainText(
    "집계 기준이 만료되었습니다. 최신 집계를 다시 조회하세요",
  );
  await page.route(ingestStatusUrl, (route) => {
    summaryRequests++;
    return route.fulfill(
      summaryFails
        ? { status: 503, json: { error: { code: "unavailable" } } }
        : { json: { ...status(nextLoss), asOf: newEnd } },
    );
  });
  await drawer.getByRole("button", { name: "최신 집계 조회" }).click();
  await expect(drawer).toContainText(
    "갱신 실패 · 마지막으로 확인한 집계를 표시합니다",
  );
  await expect(drawer.getByLabel("전송 손실 집계")).toContainText("10건");
  await expect(drawer).toBeVisible();
  expect(summaryRequests).toBeGreaterThan(0);
  expect(windows).toEqual([loss.windowEnd]);
  summaryFails = false;
  await drawer.getByRole("button", { name: "최신 집계 조회" }).click();
  await expect(drawer.getByLabel("전송 손실 집계")).toContainText("12건");
  await expect(drawer).toContainText("개발 노트북");
  await expect(drawer).not.toContainText("집계 기준이 만료되었습니다");
  await expect(drawer).not.toContainText("갱신 실패");
  expect(windows).toEqual([loss.windowEnd, newEnd]);
});

test("정상 수집과 과거 손실을 함께 표시하고 popover 바깥 클릭으로 닫는다", async ({
  page,
}) => {
  await prepare(page, loss);
  await page.route(ingestStatusUrl, (route) =>
    route.fulfill({
      json: {
        ...status(loss),
        status: "healthy",
        reason: null,
        lastReceivedAt: "2026-11-05T05:02:00Z",
      },
    }),
  );
  await page.route("**/ingest-status/loss-installations?*", (route) =>
    route.fulfill({ json: affected(null) }),
  );
  await page.goto("/overview");
  const bar = page.getByLabel("조직 수집 현황", { exact: true });
  await expect(bar).toContainText("수집 정상");
  await expect(bar).toContainText("마지막 수신: 2026년 11월 5일 14:02");
  const trigger = bar.getByRole("button", { name: /최근 7일 전송 손실 10건/ });
  await trigger.click();
  const popup = page.getByRole("dialog", { name: "전송 손실", exact: true });
  await expect(popup).toBeVisible();
  await expect(popup).toHaveAttribute("popover", "auto");
  await expect(popup).not.toContainText("데몬이 보고한");
  await expect(popup).not.toContainText("보고 공백이나 전송 대기");
  await page.getByRole("heading", { name: "개요", exact: true }).click();
  await expect(popup).not.toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
});
