import { test, expect, type Locator, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  autoOverview,
  autoTeamsResponse,
  contract,
} from "../fixtures/auto-trend";
import {
  issueFixtureCookie,
  mockAuthenticatedRoutes,
} from "../browser/session-fixture";
import {
  ingestStatusUrl,
  mockOverviewSettings,
  testOrganizationId,
} from "../browser/overview-fixture";
import type { TransmissionLoss } from "../../src/lib/api/ingest-status";
import type { Alert } from "../../src/lib/api/alerts";

// 실제 API 촬영으로 만들기 어려운 보조 상태만 명시적 fixture로 재현한다.
// 운영 API/인증을 검증하는 suite가 아니며 모든 이미지 metadata에 이를 기록한다.
const reportDir = resolve(
  process.env.VERIFICATION_REPORT_DIR ?? "../reports/proj318-e2e-20261104",
);
const metadataPath = join(reportDir, "dashboard-states.json");
const origin = "http://localhost:3198";
const period = `startDate=${contract.request.startDate}&endDate=${contract.request.endDate}&compare=none`;
const stateByPage = new WeakMap<Page, RunState>();
type RequestFailure = {
  url: string;
  status: number | null;
  reason: string;
  intentional: boolean;
};
type RunState = {
  allowed: { path: RegExp; status: number; reason: string }[];
  failures: RequestFailure[];
  pageErrors: string[];
};
type Entry = {
  id: string;
  title: string;
  testTitle: string;
  file: string;
  feature: string;
  source: "fixture";
  mode: "auto";
  viewport: { width: number; height: number };
  checks: string[];
  intentionalFailures: string[];
  requestFailures: RequestFailure[];
  fixtureDescription: string;
};
type Metadata = {
  source: "fixture";
  entries: Entry[];
  tests: {
    title: string;
    status: string;
    failures: RequestFailure[];
    pageErrors: string[];
  }[];
};
async function metadata(): Promise<Metadata> {
  try {
    return JSON.parse(await readFile(metadataPath, "utf8")) as Metadata;
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    )
      throw error;
    return { source: "fixture", entries: [], tests: [] };
  }
}
async function saveMetadata(data: Metadata) {
  await mkdir(reportDir, { recursive: true });
  await writeFile(metadataPath, JSON.stringify(data, null, 2) + "\n");
}
function allowFailure(
  page: Page,
  path: RegExp,
  status: number,
  reason: string,
) {
  stateByPage.get(page)!.allowed.push({ path, status, reason });
}
async function capture(
  page: Page,
  id: string,
  title: string,
  feature: string,
  checks: string[],
  target: Locator,
) {
  await expect(target).toBeVisible();
  await target.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const drawer = page.getByRole("dialog");
  if ((await drawer.count()) === 1) {
    const close = drawer.getByRole("button", {
      name: "상세 패널 닫기",
      exact: true,
    });
    await expect(close).toBeVisible();
    await expect(close).toBeInViewport({ ratio: 1 });
    // CSS 애니메이션 비활성화만으로는 motion의 프레임 갱신이 끝났음을 보장하지 않는다.
    // 닫기 버튼이 완전히 그려지고 같은 좌표를 연속 네 프레임 유지한 뒤 캡처한다.
    await close.evaluate(
      (button) =>
        new Promise<void>((resolveStable, reject) => {
          const deadline = performance.now() + 5000;
          let previous: number[] | undefined;
          let stableFrames = 0;
          const observe = () => {
            const rect = button.getBoundingClientRect();
            const current = [rect.x, rect.y, rect.width, rect.height];
            const style = getComputedStyle(button);
            const painted =
              rect.width > 0 &&
              rect.height > 0 &&
              style.visibility === "visible" &&
              Number(style.opacity) === 1;
            const stable =
              painted &&
              previous?.every(
                (value, index) => Math.abs(value - current[index]) < 0.1,
              );
            stableFrames = stable ? stableFrames + 1 : 0;
            previous = current;
            if (stableFrames >= 3) resolveStable();
            else if (performance.now() >= deadline)
              reject(
                new Error(
                  "드로어 닫기 버튼의 렌더링 좌표가 안정되지 않았습니다",
                ),
              );
            else requestAnimationFrame(observe);
          };
          requestAnimationFrame(observe);
        }),
    );
    await expect(close).toBeVisible();
    await expect(close).toBeInViewport({ ratio: 1 });
  }
  const bounds = await target.boundingBox();
  if (!bounds) throw Error(`촬영 대상이 없습니다: ${id}`);
  const viewport = page.viewportSize()!;
  // main은 내부 스크롤 컨테이너다. 현재 화면에 보이는 대상 영역을 잘라 가려진 하단을 전체 촬영으로 오인하지 않는다.
  const x = Math.max(0, Math.floor(bounds.x) - 8);
  const y = Math.max(0, Math.floor(bounds.y) - 8);
  const right = Math.min(
    viewport.width,
    Math.ceil(bounds.x + bounds.width) + 8,
  );
  const bottom = Math.min(
    viewport.height,
    Math.ceil(bounds.y + bounds.height) + 8,
  );
  const file = `screenshots/states-${id}.png`;
  await mkdir(join(reportDir, "screenshots"), { recursive: true });
  await page.screenshot({
    path: join(reportDir, file),
    animations: "disabled",
    clip: { x, y, width: right - x, height: bottom - y },
  });
  const state = stateByPage.get(page)!;
  const entry: Entry = {
    id: `states-${id}`,
    title,
    testTitle: test.info().title,
    file,
    feature,
    source: "fixture",
    mode: "auto",
    viewport,
    checks,
    intentionalFailures: [...new Set(state.allowed.map((rule) => rule.reason))],
    requestFailures: [...state.failures],
    fixtureDescription:
      "보조 UI 상태 재현용 응답입니다. 실제 API·SQL·운영 인증의 실행 증거와 구분합니다.",
  };
  const data = await metadata();
  data.entries = [
    ...data.entries.filter((item) => item.id !== entry.id),
    entry,
  ];
  await saveMetadata(data);
}
const header = (page: Page) => page.getByLabel("공통 헤더", { exact: true });
const lossBar = (page: Page) =>
  page.getByLabel("조직 수집 현황", { exact: true });
const lossDrawer = (page: Page) =>
  page.getByRole("dialog", { name: "전송 손실 상세", exact: true });
const drawerPanel = (drawer: Locator) => drawer.locator("section").first();
const complete = <T>(value: T) => ({
  value,
  status: "complete" as const,
  reasons: [],
});
const missing = (future: boolean) => ({
  value: null,
  status: "unavailable" as const,
  reasons: [future ? "upcoming" : "no_data"],
});
const loss: TransmissionLoss = {
  payloadCount: 10,
  affectedInstallationCount: 2,
  windowStart: "2026-10-28T00:00:00Z",
  windowEnd: "2026-11-04T00:00:00Z",
  availableFrom: "2026-10-28T00:00:00Z",
  availability: "complete",
  reasons: [],
};
const status = (transmissionLoss?: TransmissionLoss) => ({
  organizationId: testOrganizationId,
  status: "unknown",
  reason: "source_query_failed",
  asOf: loss.windowEnd,
  lastReceivedAt: null,
  transmissionLoss,
});
const affected = (window = loss) => ({
  meta: {
    organizationId: testOrganizationId,
    snapshotId: `loss-${window.windowEnd}`,
    asOf: window.windowEnd,
  },
  windowStart: window.windowStart,
  windowEnd: window.windowEnd,
  installations: {
    items: [
      {
        installationId: "installation-a",
        deviceName: "개발 노트북",
        memberId: "member-a",
        account: "member@example.test",
        payloadCount: 7,
        lastObservedAt: "2026-11-03T00:00:00Z",
        status: "active",
      },
      {
        installationId: "installation-b",
        deviceName: "폐기된 개발 기기",
        memberId: "member-a",
        account: "member@example.test",
        payloadCount: 3,
        lastObservedAt: "2026-11-03T00:00:00Z",
        status: "revoked",
      },
    ],
    totalCount: 2,
    nextCursor: null,
  },
});
async function prepareTeams(
  page: Page,
  data: ReturnType<typeof autoTeamsResponse>,
) {
  await page.route("**/analytics/teams?*", (route) =>
    route.fulfill({ json: data }),
  );
  await page.route("**/analytics/teams/*/users?*", (route) => {
    const team = data.teams.items[0] ?? data.unassigned;
    return route.fulfill({
      json: {
        meta: data.meta,
        team: { teamId: team.teamId, teamName: team.teamName },
        summary: {
          usage: {
            activeUsers: team.metrics.activeUsers,
            sessionCount: team.metrics.sessionCount,
            totalTokens: team.metrics.totalTokens,
            equivalentCostUsd: team.metrics.equivalentCostUsd,
          },
          averageEquivalentCostUsd: null,
          cacheHitRatio: complete(0),
          unidentifiedEquivalentCostUsd: "0.000000",
        },
        users: { items: [], totalCount: 0, nextOffset: null },
      },
    });
  });
}

test.beforeEach(async ({ page }, info) => {
  const previous = await metadata();
  previous.entries = previous.entries.filter(
    (entry) => entry.testTitle !== info.title,
  );
  previous.tests = previous.tests.filter(
    (record) => record.title !== info.title,
  );
  await saveMetadata(previous);
  const state: RunState = { allowed: [], failures: [], pageErrors: [] };
  stateByPage.set(page, state);
  page.on("pageerror", (error) => state.pageErrors.push(error.message));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (!url.pathname.includes("/api/") || response.status() < 400) return;
    const rule = state.allowed.find(
      (item) =>
        item.status === response.status() && item.path.test(url.pathname),
    );
    state.failures.push({
      url: url.pathname + url.search,
      status: response.status(),
      reason: rule?.reason ?? "예상하지 않은 HTTP 실패",
      intentional: !!rule,
    });
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.includes("/api/")) return;
    const reason = request.failure()?.errorText ?? "unknown";
    state.failures.push({
      url: url.pathname + url.search,
      status: null,
      reason,
      intentional: reason === "net::ERR_ABORTED",
    });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockAuthenticatedRoutes(page);
  await issueFixtureCookie(page, { origin });
  await mockOverviewSettings(page);
  await page.clock.setFixedTime(new Date(contract.asOf));
  await page.route("**/analytics/overview?*", (route) =>
    route.fulfill({ json: autoOverview() }),
  );
  await page.route(ingestStatusUrl, (route) =>
    route.fulfill({ json: status(loss) }),
  );
  await page.route("**/ingest-status/loss-installations?*", (route) =>
    route.fulfill({ json: affected() }),
  );
});
test.afterEach(async ({ page }, info) => {
  const state = stateByPage.get(page)!;
  const data = await metadata();
  const record = {
    title: info.title,
    status:
      state.pageErrors.length ||
      state.failures.some((failure) => !failure.intentional)
        ? "failed"
        : (info.status ?? "unknown"),
    failures: state.failures,
    pageErrors: state.pageErrors,
  };
  data.tests = [
    ...data.tests.filter((item) => item.title !== info.title),
    record,
  ];
  await saveMetadata(data);
  expect(
    state.pageErrors,
    "보조 상태에 예상하지 않은 브라우저 예외가 없어야 한다",
  ).toEqual([]);
  expect(
    state.failures.filter((failure) => !failure.intentional),
    "명시한 장애 응답 이외의 요청 실패가 없어야 한다",
  ).toEqual([]);
});

test("316 손실 헤더의 대기·최초 실패·재시도 복구", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolveGate) => {
    release = resolveGate;
  });
  let failed = true;
  allowFailure(
    page,
    /\/ingest-status$/,
    503,
    "최초 손실 조회 실패와 재시도를 검증하기 위한 의도적 HTTP 503",
  );
  await page.route(ingestStatusUrl, async (route) => {
    await gate;
    return route.fulfill(
      failed
        ? { status: 503, json: { error: { code: "unavailable" } } }
        : { json: status(loss) },
    );
  });
  await page.goto(`/overview?${period}`);
  await expect(lossBar(page)).toContainText("전송 손실 확인 중");
  await capture(
    page,
    "loss-loading",
    "손실 헤더 · 조회 대기",
    "PROJ-316",
    [
      "응답을 지연하여 실제 조회 중 UI를 확인",
      "미확인 수량을 0건으로 표시하지 않음",
    ],
    header(page),
  );
  release();
  await expect(lossBar(page)).toContainText("전송 손실을 불러오지 못했습니다");
  await expect(lossBar(page)).not.toContainText("0건");
  await capture(
    page,
    "loss-initial-error",
    "손실 헤더 · 최초 조회 실패",
    "PROJ-316",
    ["의도적 503 응답의 오류 문구와 다시 조회 버튼"],
    header(page),
  );
  failed = false;
  await lossBar(page).getByRole("button", { name: "다시 조회" }).click();
  await expect(lossBar(page)).toContainText("최근 7일 전송 손실 10건");
  await capture(
    page,
    "loss-recovered",
    "손실 헤더 · 재시도 복구",
    "PROJ-316",
    ["다시 조회 성공 후 실제 응답 수량 10건 표시"],
    header(page),
  );
});

for (const scenario of [
  {
    id: "zero",
    title: "확인된 0",
    value: { ...loss, payloadCount: 0, affectedInstallationCount: 0 },
    label: "최근 7일 전송 손실 0건",
  },
  {
    id: "unavailable",
    title: "집계 불가",
    value: {
      ...loss,
      payloadCount: null,
      affectedInstallationCount: null,
      availability: "unavailable" as const,
      reasons: ["query_failed"],
    },
    label: "최근 7일 전송 손실 집계 불가",
  },
  {
    id: "legacy",
    title: "구버전 응답",
    value: undefined,
    label: "집계 정보 없음",
  },
])
  test(`316 손실 ${scenario.title}`, async ({ page }) => {
    await page.route(ingestStatusUrl, (route) =>
      route.fulfill({ json: status(scenario.value) }),
    );
    await page.goto(`/overview?${period}`);
    await expect(lossBar(page)).toContainText(scenario.label);
    await expect(lossBar(page)).toContainText("기준");
    if (scenario.id !== "zero")
      await expect(lossBar(page)).not.toContainText("손실 0건");
    await capture(
      page,
      `loss-${scenario.id}`,
      `손실 헤더 · ${scenario.title}`,
      "PROJ-316",
      [scenario.label, "HTTP 성공 응답의 도메인 상태이며 네트워크 실패와 구분"],
      header(page),
    );
  });

test("316 부분 집계의 갱신 실패·현재 상태 실패를 데스크톱과 모바일에서 구분", async ({
  page,
}) => {
  const partial: TransmissionLoss = {
    ...loss,
    availability: "partial",
    availableFrom: "2026-11-01T00:00:00Z",
    reasons: ["history_incomplete", "counter_decreased"],
  };
  await page.route(ingestStatusUrl, (route) =>
    route.fulfill({ json: status(partial) }),
  );
  await page.goto(`/overview?${period}`);
  await expect(lossBar(page)).toContainText("10건 · 일부 집계");
  allowFailure(
    page,
    /\/ingest-status$/,
    503,
    "정상 부분 집계 후 갱신 실패와 마지막 응답 보존을 검증하기 위한 의도적 HTTP 503",
  );
  await page.route(ingestStatusUrl, (route) =>
    route.fulfill({ status: 503, json: { error: { code: "unavailable" } } }),
  );
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(lossBar(page)).toContainText("갱신 실패");
  await expect(lossBar(page)).toContainText("10건 · 일부 집계");
  await capture(
    page,
    "loss-partial-stale-header",
    "부분 손실 집계 · 갱신 실패 후 마지막 값",
    "PROJ-316",
    ["10건·일부 집계·집계 시작·기준 시각 유지", "갱신 실패를 숫자와 함께 표시"],
    header(page),
  );
  await lossBar(page).getByRole("button").click();
  const drawer = lossDrawer(page);
  await expect(drawer).toContainText("같은 실행의 손실 누계가 감소한 보고");
  await expect(drawer).toContainText("현재 전송 상태를 조회하지 못했습니다");
  await expect(drawer).toContainText("마지막으로 확인한 집계");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 1000 : 1100 });
    await drawer
      .getByLabel("전송 손실 상세 내용", { exact: true })
      .evaluate((element) => {
        element.scrollTop = 0;
      });
    await capture(
      page,
      `loss-partial-stale-${width}`,
      `부분 손실 집계 상세 · ${width === 390 ? "모바일" : "데스크톱"}`,
      "PROJ-316",
      [
        "부분 집계 제한 사유",
        "현재 전송 상태 조회 실패가 손실 수량을 덮어쓰지 않음",
        "손실 상세가 뷰포트 안에 유지됨",
      ],
      drawerPanel(drawer),
    );
  }
});

test("316 손실 상세 기준 만료와 최신 집계 복구", async ({ page }) => {
  let expired = true;
  const next = {
    ...loss,
    windowStart: "2026-10-28T00:11:00Z",
    windowEnd: "2026-11-04T00:11:00Z",
  };
  allowFailure(
    page,
    /\/ingest-status\/loss-installations$/,
    409,
    "상세 snapshot 만료 복구를 검증하기 위한 의도적 HTTP 409 snapshot_expired",
  );
  await page.route("**/ingest-status/loss-installations?*", (route) =>
    route.fulfill(
      expired
        ? {
            status: 409,
            json: { error: { code: "snapshot_expired", message: "만료" } },
          }
        : { json: affected(next) },
    ),
  );
  await page.goto(`/overview?${period}`);
  await lossBar(page).getByRole("button").click();
  const drawer = lossDrawer(page);
  await expect(drawer).toContainText("집계 기준이 만료되었습니다");
  await expect(
    drawer.getByRole("button", { name: "최신 집계 조회" }),
  ).toBeVisible();
  await capture(
    page,
    "loss-expired",
    "손실 상세 · 기준 만료",
    "PROJ-316",
    [
      "409를 일반 조회 실패와 구분",
      "최신 집계 조회로 요약부터 새 기준을 받는 경로",
    ],
    drawerPanel(drawer),
  );
  expired = false;
  await page.route(ingestStatusUrl, (route) =>
    route.fulfill({ json: { ...status(next), asOf: next.windowEnd } }),
  );
  await drawer.getByRole("button", { name: "최신 집계 조회" }).click();
  await expect(drawer).toContainText("개발 노트북");
  await expect(drawer).not.toContainText("집계 기준이 만료되었습니다");
});

test("316 보고 공백의 확인·해소·폐기 상태는 독립적이다", async ({ page }) => {
  const initial: Alert = {
    alertId: "gap-one",
    version: 1,
    ruleId: "installation_report_gap",
    category: "collection",
    status: "open",
    occurredAt: loss.windowEnd,
    lastSeenAt: loss.windowEnd,
    windowStart: loss.windowStart,
    windowEnd: loss.windowEnd,
    subject: "installation-a",
    eventCount: null,
    memberCount: 1,
    members: [{ memberId: "member-a", account: "member@example.test" }],
    evidence: {
      kind: "installation_report_gap",
      installationId: "installation-a",
      deviceName: "개발 노트북",
      basisAt: loss.windowStart,
      thresholdReachedAt: loss.windowEnd,
      lastReceivedAt: loss.windowStart,
      resolutionDetectedAt: null,
      resolutionReason: null,
    },
    acknowledgement: null,
  };
  const alerts: Alert[] = [initial];
  await page.route("**/api/v1/organizations/*/alerts?*", (route) => {
    const query = new URL(route.request().url()).searchParams;
    const items = alerts.filter(
      (item) =>
        (!query.has("category") || query.get("category") === item.category) &&
        (query.get("status") === "all" ||
          (query.get("status") === "acknowledged") === !!item.acknowledgement),
    );
    return route.fulfill({
      json: {
        meta: {
          organizationId: testOrganizationId,
          snapshotId: "gap-states",
          asOf: loss.windowEnd,
        },
        evaluation: { status: "complete", reasons: [], asOf: loss.windowEnd },
        alerts: { items, totalCount: items.length, nextCursor: null },
      },
    });
  });
  await page.route("**/alerts/gap-one/acknowledge", (route) => {
    expect(route.request().postDataJSON()).toEqual({ expectedVersion: 1 });
    initial.acknowledgement = {
      acknowledgedAt: "2026-11-04T00:01:00Z",
    };
    return route.fulfill({
      json: {
        alertId: initial.alertId,
        version: 1,
        ...initial.acknowledgement,
        acknowledgedBy: "admin",
      },
    });
  });
  await page.goto(`/overview?${period}`);
  await page
    .getByRole("button", { name: "알림, 미확인 1건", exact: true })
    .click();
  const drawer = page.getByRole("dialog", { name: "알림", exact: true });
  const row = drawer.locator('[data-alert-id="gap-one"]');
  await row.getByText("상세", { exact: true }).click();
  await expect(row).toContainText("보고 공백 지속");
  await expect(row).toContainText("168시간 도달");
  await expect(row).not.toContainText("위반 수");
  await capture(
    page,
    "alert-open-unacknowledged",
    "보고 공백 · 지속·미확인",
    "PROJ-316",
    [
      "수집 범주와 공백 상세 근거",
      "미확인 상태",
      "손실·이벤트 수와 공백을 혼동하지 않는 설명",
    ],
    drawerPanel(drawer),
  );
  await row.getByRole("button", { name: /확인$/ }).click();
  await drawer
    .getByRole("group", { name: "알림 상태" })
    .getByRole("button", { name: "전체", exact: true })
    .click();
  await expect(row).toContainText("확인함");
  await expect(row).toContainText("보고 공백 지속");
  await capture(
    page,
    "alert-open-acknowledged",
    "보고 공백 · 확인했지만 지속",
    "PROJ-316",
    ["확인 동작은 공백을 해소하지 않음", "공백 지속과 확인함을 함께 표시"],
    drawerPanel(drawer),
  );
  initial.status = "closed";
  if (initial.evidence?.kind !== "installation_report_gap")
    throw Error("gap fixture expected");
  initial.evidence.resolutionDetectedAt = "2026-11-04T00:02:00Z";
  initial.evidence.resolutionReason = "report_resumed";
  alerts.push({
    ...initial,
    alertId: "gap-two",
    acknowledgement: null,
    evidence: {
      ...initial.evidence,
      installationId: "installation-b",
      deviceName: "폐기된 개발 기기",
      resolutionReason: "installation_revoked",
    },
  });
  await page.reload();
  await page
    .getByRole("button", { name: "알림, 미확인 1건", exact: true })
    .click();
  await drawer
    .getByRole("group", { name: "알림 상태" })
    .getByRole("button", { name: "전체", exact: true })
    .click();
  await expect(row).toContainText("보고 재개로 해소");
  await expect(row).toContainText("확인함");
  const revoked = drawer.locator('[data-alert-id="gap-two"]');
  await expect(revoked).toContainText("설치 폐기로 종료");
  await expect(revoked).toContainText("미확인");
  await capture(
    page,
    "alert-resolved-independent",
    "보고 공백 · 해소·폐기와 확인 여부 독립",
    "PROJ-316",
    [
      "보고 재개로 해소+확인함",
      "설치 폐기로 종료+미확인",
      "해소만으로 알림을 확인 처리하지 않음",
    ],
    drawerPanel(drawer),
  );
  await page.setViewportSize({ width: 390, height: 1000 });
  await drawer
    .getByRole("group", { name: "알림 상태" })
    .getByRole("button", { name: "미확인", exact: true })
    .click();
  await revoked.getByText("상세", { exact: true }).click();
  await expect(revoked.getByRole("button", { name: /확인$/ })).toBeEnabled();
  await capture(
    page,
    "alert-resolved-mobile",
    "보고 공백 · 종료했지만 미확인인 모바일 상세",
    "PROJ-316",
    [
      "설치 폐기로 종료 상태의 상세",
      "미확인과 확인 버튼 유지",
      "모바일 드로어 폭 안에서 줄바꿈",
    ],
    drawerPanel(drawer),
  );
});

test("317 자동 시간 구간의 현재·미래·기록 없음", async ({ page }) => {
  await page.goto(`/overview?${period}`);
  const region = page.getByRole("region", {
    name: "사용 환산액 추이",
    exact: true,
  });
  await region.scrollIntoViewIfNeeded();
  const slider = region.getByRole("slider");
  await expect(slider).toHaveAttribute("aria-valuemax", "4");
  await slider.focus();
  await slider.press("Home");
  await slider.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuetext", /확인할 근거가 부족/);
  await capture(
    page,
    "auto-unknown",
    "자동 추이 · 지난 구간의 기록 없음",
    "PROJ-317",
    ["지난 구간의 null을 0으로 채우지 않음", "KST 구간과 종료 미포함 설명"],
    region,
  );
  await slider.press("ArrowRight");
  await slider.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuetext", /집계 중/);
  await expect(slider).toHaveAttribute(
    "aria-valuetext",
    /기록된 사용량에서 확인된 0/,
  );
  await capture(
    page,
    "auto-current",
    "자동 추이 · 현재 집계 중인 구간",
    "PROJ-317",
    [
      "집계 중인 실제 시간 구간",
      "명시적 0과 기록 없는 구간 구분",
      "미래 구간은 반환하지 않음",
    ],
    region,
  );
  await slider.press("End");
  await expect(slider).toHaveAttribute(
    "aria-valuetext",
    /2026-11-04 10:30 KST.*집계 중/,
  );
  await capture(
    page,
    "auto-upcoming",
    "자동 추이 · 현재 시각으로 잘린 마지막 구간",
    "PROJ-317",
    ["4개 연속 구간의 마지막까지 탐색", "현재 시각 뒤 구간을 탐색하지 않음"],
    region,
  );
});

test("317 빈 자동 기간의 개요·팀은 시간축을 유지한다", async ({ page }) => {
  const overview = autoOverview();
  overview.meta.dataState = "no_data";
  overview.summary = null;
  overview.modelMix = null;
  overview.teamUsage = null;
  if (overview.trend?.bucket !== "auto") throw Error("auto fixture expected");
  overview.trend.points = overview.trend.points.map((point) => ({
    ...point,
    usageRows: point.temporalState === "upcoming" ? null : 0,
    pricedUsageRows: point.temporalState === "upcoming" ? null : 0,
    unpricedUsageRows: point.temporalState === "upcoming" ? null : 0,
    equivalentCostUsd: missing(point.temporalState === "upcoming"),
    knownEquivalentCostUsd: missing(point.temporalState === "upcoming"),
    totalTokens: missing(point.temporalState === "upcoming"),
  }));
  await page.route("**/analytics/overview?*", (route) =>
    route.fulfill({ json: overview }),
  );
  await page.goto(`/overview?${period}`);
  await expect(
    page.getByText("선택한 기간에 데이터가 없습니다", { exact: true }),
  ).toBeVisible();
  const slider = page.getByRole("slider");
  await expect(slider).toHaveAttribute("aria-valuemax", "4");
  await slider.focus();
  await slider.press("End");
  await expect(slider).toHaveAttribute("aria-valuetext", /집계 중/);
  await capture(
    page,
    "auto-overview-empty",
    "개요 · 빈 자동 기간도 시간축 유지",
    "PROJ-317",
    ["기간 빈 안내", "4개 시간 구간", "현재까지 방향키 탐색 유지"],
    page.getByRole("main"),
  );
  const teams = autoTeamsResponse();
  teams.meta.dataState = "no_data";
  teams.teams = { items: [], totalCount: 0, nextOffset: null };
  for (const metrics of [teams.totals, teams.unassigned.metrics]) {
    metrics.pricedUsageRows = 0;
    metrics.unpricedUsageRows = 0;
    for (const metric of Object.values(metrics)) {
      if (metric && typeof metric === "object")
        Object.assign(metric, missing(false));
    }
  }
  teams.unassigned.trend = teams.unassigned.trend.map((point) => {
    if (!("bucketStart" in point)) throw Error("auto fixture expected");
    return {
      ...point,
      usageRows: point.temporalState === "upcoming" ? null : 0,
      pricedUsageRows: point.temporalState === "upcoming" ? null : 0,
      unpricedUsageRows: point.temporalState === "upcoming" ? null : 0,
      cumulativeEquivalentCostUsd: missing(point.temporalState === "upcoming"),
      cumulativeKnownEquivalentCostUsd: missing(
        point.temporalState === "upcoming",
      ),
      cumulativeTotalTokens: missing(point.temporalState === "upcoming"),
      cumulativeSessionCount: missing(point.temporalState === "upcoming"),
    };
  });
  await prepareTeams(page, teams);
  await page.goto(`/teams?${period}`);
  await expect(
    page.getByText("선택한 기간에 데이터가 없습니다", { exact: true }),
  ).toBeVisible();
  const teamSlider = page.getByRole("slider");
  await expect(teamSlider).toHaveAttribute("aria-valuemax", "4");
  await teamSlider.focus();
  await teamSlider.press("End");
  await expect(teamSlider).toHaveAttribute("aria-valuetext", /집계 중/);
  await capture(
    page,
    "auto-teams-empty",
    "팀 분석 · 빈 자동 기간도 시간축 유지",
    "PROJ-317",
    ["팀이 없을 때도 4개 시간축과 현재까지 탐색 유지", "비용·토큰 선택 유지"],
    page.getByRole("main"),
  );
});

test("318 사용 행 수가 없는 구버전의 0값 미배정 행은 unknown으로 보존한다", async ({
  page,
}) => {
  const data = autoTeamsResponse();
  const usage = data.unassigned.metrics;
  for (const [name, metric] of Object.entries(usage)) {
    if (metric && typeof metric === "object")
      Object.assign(metric, complete(name.endsWith("Usd") ? "0.000000" : 0));
  }
  delete usage.pricedUsageRows;
  delete usage.unpricedUsageRows;
  data.unassigned.products = [];
  data.unassigned.modelMix = {
    availability: "unavailable",
    reason: "no_data",
    data: null,
  };
  data.unassigned.trend = data.unassigned.trend.map((point) => {
    if (!("bucketStart" in point)) throw Error("auto fixture expected");
    const future = point.temporalState === "upcoming";
    return {
      ...point,
      usageRows: future ? null : 0,
      pricedUsageRows: future ? null : 0,
      unpricedUsageRows: future ? null : 0,
      cumulativeEquivalentCostUsd: future
        ? missing(true)
        : complete("0.000000"),
      cumulativeKnownEquivalentCostUsd: future
        ? missing(true)
        : complete("0.000000"),
      cumulativeTotalTokens: future ? missing(true) : complete(0),
      cumulativeSessionCount: future ? missing(true) : complete(0),
    };
  });
  await prepareTeams(page, data);
  await page.goto(`/teams?${period}`);
  const panel = page.getByRole("region", { name: "팀별 사용량 비교" });
  const checkbox = panel.getByRole("checkbox", {
    name: "미배정 추이 선 표시",
    exact: true,
  });
  await expect(checkbox).toBeChecked();
  const row = checkbox.locator("xpath=../..");
  await expect(row).toContainText("$0.00");
  await expect(panel.getByRole("tab")).toHaveText(["비용", "토큰"]);
  await checkbox.scrollIntoViewIfNeeded();
  await capture(
    page,
    "unassigned-unknown-zero",
    "미배정 · 사용 행 수 누락을 미사용으로 단정하지 않음",
    "PROJ-318",
    [
      "세션·사용자·토큰·금액이 0이어도 optional 행 수 누락이면 행 보존",
      "unknown을 실제 사용이라고 새 문구로 단정하지 않음",
      "비용·토큰 탭 유지",
    ],
    panel,
  );
  // 같은 응답이 명시적인 0+0을 주면 행을 숨긴다. 화면을 임의로 0으로 바꾼 것이 아님을 함께 검증한다.
  usage.pricedUsageRows = 0;
  usage.unpricedUsageRows = 0;
  await page.reload();
  await expect(checkbox).toHaveCount(0);
});
