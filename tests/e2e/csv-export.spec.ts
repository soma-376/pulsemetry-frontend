import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { dashboardBase, expect, test, seedOrganizations } from "./fixtures";
import {
  authenticatedRequest,
  seedPeriod,
  selectPeriod,
  signIn,
} from "./helpers";
import { PreparationError } from "./harness";
import { groupModels } from "../../src/lib/api/overview-format";
import type { Overview } from "../../src/lib/api/overview";

// 공통 헤더의 CSV — 실제로 내려받은 파일을 화면이 쓴 같은 응답(같은 기간·비교·snapshot)과 시드 명세에 대조한다.
// 금액은 서버의 USD 문자열 그대로, null 은 빈 칸이어야 한다. 쓰기는 없다.
const [A, , C] = seedOrganizations;

/** 따옴표를 아는 작은 파서 — 머리 블록(첫 빈 줄 전)과 절마다의 행. */
function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\r" && text[index + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      index++;
    } else cell += char;
  }
  const meta = new Map<string, string>();
  const sections: Record<string, Record<string, string>[]> = {};
  let columns: string[] | null = null,
    inMeta = true;
  for (const values of rows) {
    if (values.length === 1 && values[0] === "") {
      inMeta = false;
      columns = null;
      continue;
    }
    if (inMeta) {
      meta.set(values[0], values[1]);
      continue;
    }
    if (values[0] === "section") {
      columns = values;
      continue;
    }
    (sections[values[0]] ??= []).push(
      Object.fromEntries(
        values.map((value, index) => [columns![index], value]),
      ),
    );
  }
  return { meta, sections };
}

async function download(page: Page) {
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  const file = await event;
  const text = await readFile((await file.path())!, "utf8");
  expect(text.charCodeAt(0), "UTF-8 BOM").toBe(0xfeff);
  return { name: file.suggestedFilename(), ...parseCsv(text.slice(1)) };
}

function seedCostA() {
  const value = process.env.E2E_SEED_A_PERIOD_COST_USD ?? "";
  if (!/^\d+(\.\d+)?$/.test(value))
    throw new PreparationError(
      ".env.local의 E2E_SEED_A_PERIOD_COST_USD를 시드 plan 의 period_known_estimated_usd 로 설정하세요.",
    );
  return Number(value);
}

test("CSV-OVERVIEW-A @p1 @read 개요 CSV 는 화면과 같은 기간의 응답이고, 금액은 서버 문자열 그대로이며 합계는 시드 plan 과 같다", async ({
  page,
}) => {
  const { start, end } = seedPeriod();
  await signIn(page, `owner@seed-${A.seed}.example.test`);
  const shown = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/v1/organizations/${A.id}/analytics/overview` &&
      url.searchParams.get("startDate") === start &&
      url.searchParams.get("endDate") === end
    );
  });
  await selectPeriod(page, start, end);
  const api = (await (await shown).json()) as Overview;
  const csv = await download(page);
  expect(csv.name).toBe(`overview_${start}_${end}.csv`);
  expect(csv.meta.get("organization")).toBe(A.name);
  expect(csv.meta.get("period")).toBe(`${start} ~ ${end}`);
  const cost = csv.sections.summary.find(
    (row) => row.metric === "equivalentCostUsd",
  )!;
  expect(cost.value).toBe(api.summary!.equivalentCostUsd.value);
  expect(Number(cost.value)).toBeCloseTo(seedCostA(), 6);
  expect(csv.sections.trend).toHaveLength(api.meta.dayCount);
  csv.sections.trend.forEach((row, index) => {
    const point = api.trend!.points[index];
    expect(row.date).toBe(point.date);
    expect(row.equivalentCostUsd).toBe(point.equivalentCostUsd.value ?? "");
    expect(row.totalTokens).toBe(
      point.totalTokens.value === null ? "" : String(point.totalTokens.value),
    );
  });
  expect(
    csv.sections.modelMix.map((row) => [row.model, row.equivalentCostUsd]),
  ).toEqual(
    groupModels(api.modelMix!.models).map((model) => [
      model.modelId,
      model.equivalentCostUsd.value ?? "",
    ]),
  );
  expect(csv.sections.product_usage).toBeUndefined();
  expect(
    csv.sections.teamUsage.some((row) => row.teamId === "other_teams"),
  ).toBe(false);
});

test("CSV-TEAMS-A @p1 @read 팀 CSV 는 같은 snapshot 의 팀 전부와 사용자 표에서 고른 팀의 사용자 전부다", async ({
  page,
}) => {
  const { start, end } = seedPeriod();
  await signIn(page, `owner@seed-${A.seed}.example.test`);
  await page.goto("/teams");
  await expect(
    page.getByRole("heading", { name: "팀 분석", exact: true }),
  ).toBeVisible();
  const listed = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/v1/organizations/${A.id}/analytics/teams` &&
      url.searchParams.get("startDate") === start &&
      url.searchParams.get("endDate") === end
    );
  });
  await selectPeriod(page, start, end);
  const api = (await (await listed).json()) as {
    meta: { snapshotId: string };
    teams: {
      items: {
        teamId: string;
        teamName: string;
        current: { equivalentCostUsd: string | null } | null;
      }[];
      totalCount: number;
      nextCursor: string | null;
    };
  };
  expect(api.teams.nextCursor).toBeNull();
  await expect(
    page.getByRole("region", { name: "사용자별 사용량" }),
  ).toBeVisible();
  const csv = await download(page);
  expect(csv.name).toBe(`teams_${start}_${end}.csv`);
  expect(csv.meta.get("snapshot")).toBe(api.meta.snapshotId);
  const teams = csv.sections.teams;
  expect(teams).toHaveLength(api.teams.totalCount + 1);
  for (const team of api.teams.items)
    expect(
      teams.find((row) => row.teamId === team.teamId)!.equivalentCostUsd,
    ).toBe(team.current?.equivalentCostUsd ?? "");
  // 사용자 표의 기본 팀(첫 팀)의 사용자 전부 — 같은 snapshot 의 사용자 API 와 같다.
  const chosen = csv.meta.get("고른 팀")!;
  const team = api.teams.items.find((item) => item.teamName === chosen) ?? null;
  expect(team, "고른 팀이 목록에 있다").not.toBeNull();
  const users = await authenticatedRequest(
    page,
    dashboardBase(),
    `/api/v1/organizations/${A.id}/analytics/teams/${team!.teamId}/users?startDate=${start}&endDate=${end}&timeZone=Asia/Seoul&snapshotId=${api.meta.snapshotId}&limit=100`,
  );
  expect(users.status).toBe(200);
  const rows = csv.sections.team_users;
  expect(rows).toHaveLength(users.body.users.totalCount);
  expect(rows.map((row) => [row.account, row.equivalentCostUsd])).toEqual(
    (
      users.body.users.items as {
        account: string;
        usage: { equivalentCostUsd: string | null };
      }[]
    ).map((user) => [user.account, user.usage.equivalentCostUsd ?? ""]),
  );
});

test("CSV-SETTINGS-C @p1 @read 설정 CSV는 화면의 카드·벤더 표 값과 상태만 담는다", async ({
  page,
}) => {
  await signIn(page, `owner@seed-${C.seed}.example.test`);
  const loaded = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        `/api/v1/organizations/${C.id}/settings` && response.status() === 200,
  );
  await page.goto("/settings");
  const api = (await (await loaded).json()) as {
    vendors: {
      totalCount: number;
      items: {
        vendorId: string;
        kind: string;
        monthlySeatFeeUsd: { value: string | null };
      }[];
    };
  };
  await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();
  const csv = await download(page);
  expect(csv.meta.get("조직")).toBe(C.name);
  expect(csv.sections.vendors).toHaveLength(api.vendors.totalCount);
  const cursor = csv.sections.vendors.find((row) => row.kind === "cursor")!;
  expect(cursor.monthlySeatFeeUsd).toBe(
    api.vendors.items.find((vendor) => vendor.kind === "cursor")!
      .monthlySeatFeeUsd.value,
  );
  expect(cursor).not.toHaveProperty("meteredActualBilledUsd");
  expect(csv.sections).not.toHaveProperty("contract_tiers");
  expect(csv.sections.summary.map((row) => row.metric)).toEqual(
    expect.arrayContaining([
      "activeSeats7d",
      "meteredMonthToDate",
      "unconfiguredVendors",
    ]),
  );
});
