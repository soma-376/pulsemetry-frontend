import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test, seedOrganizations } from "../e2e/fixtures";
import { signIn, signOut } from "../e2e/helpers";

// 데몬(telemetryctl 통합 테스트)이 시드 B에 설치를 등록하고 보고·전달·정책 적용을 하는 동안, 단계마다 화면이 서버의 판정을 따라 바뀌는지 본다.
// 걸음은 단계 디렉터리의 파일로 맞춘다: 데몬 쪽이 <단계>.ready(관찰값 JSON)를 쓰면 화면을 확인하고 <단계>.seen을 쓴다.
// 기대값은 명세의 판정 규칙이다 — 수신 이력이 없으면 수신 대기, 전달이 확인되면 수집 정상, 새 판을 받기 전에는 미적용.
const B = seedOrganizations[1];

function stageDir() {
  const dir = process.env.E2E_DAEMON_STAGE_DIR;
  if (!dir) throw new Error("E2E 선행 조건 실패: E2E_DAEMON_STAGE_DIR에 데몬 통합 테스트(telemetryctl `go test -tags integration -run TestIntegrationEndToEnd ./internal/daemon`)의 PULSEMETRY_IT_STAGE_DIR와 같은 디렉터리를 주고 함께 돌리세요.");
  return dir;
}
async function reached<T>(name: string): Promise<T> {
  const file = join(stageDir(), `${name}.ready`);
  await expect.poll(() => existsSync(file), { timeout: 6 * 60_000, intervals: [1000], message: `데몬 단계 ${name}` }).toBe(true);
  return JSON.parse(readFileSync(file, "utf8")) as T;
}
const seen = (name: string) => writeFileSync(join(stageDir(), `${name}.seen`), new Date().toISOString());

type Row = { installationId: string; appliedPolicyVersion: number };
async function openRollout(page: Page) {
  await page.getByRole("button", { name: "정책 적용 현황 보기", exact: true }).click();
  return page.getByRole("dialog", { name: "수집 정책 적용 현황", exact: true });
}
async function closeRollout(page: Page) {
  await page.getByRole("dialog", { name: "수집 정책 적용 현황", exact: true }).getByRole("button", { name: "닫기", exact: true }).last().click();
}

test("DAEMON-FLOW @p0 @write 데몬의 등록·보고·전달·정책 적용이 헤더와 정책 적용 현황에 그대로 나타난다", async ({ page }) => {
  const bar = page.getByLabel("조직 수집 현황", { exact: true });
  const rollout = (applied: number, outdated: number, unknown: number) =>
    page.getByText(`적용 ${applied}대 · 미적용 ${outdated}대 · 확인 불가 ${unknown}대 · 설치 보고 기준`, { exact: true });

  // 1. 등록 직후 — 보고로 적용이 확인됐다. 수신 이력은 아직 없다.
  const enrolled = await reached<{ installationId: string; row: Row }>("enrolled");
  await signIn(page, `owner@seed-${B.seed}.example.test`);
  await page.goto("/settings");
  await expect(rollout(1, 0, 0)).toBeVisible();
  await expect(bar).toContainText("수신 대기");
  await expect(bar).toContainText("보고 중인 설치 1대");
  let dialog = await openRollout(page);
  await dialog.getByRole("button", { name: /^적용 1$/ }).click();
  const row = dialog.getByRole("table", { name: "설치 목록" }).locator("tbody tr").filter({ has: page.locator(`[title="${enrolled.installationId}"]`) });
  await expect(row).toContainText(`v${enrolled.row.appliedPolicyVersion}`);
  await expect(row.locator("td").last()).not.toHaveText("-");
  await closeRollout(page);
  seen("enrolled");

  // 2. 전달 — 수집 서버가 받았고 보고가 손실 없이 이어진다.
  await reached("collecting");
  await page.reload();
  await expect(bar).toContainText("수집 정상");
  await expect(bar).toContainText("마지막 수신");
  await expect(bar).toContainText("보고 중인 설치 1대");
  seen("collecting");

  // 3. 관리자가 정책을 바꿨다 — 설치는 새 판을 아직 받지 못했다(이 PC의 사용자가 로그인 전).
  const outdated = await reached<{ desired: number; row: Row }>("outdated");
  await page.reload();
  await expect(rollout(0, 1, 0)).toBeVisible();
  await expect(page.getByText(`v${outdated.desired}`, { exact: true })).toBeVisible();
  dialog = await openRollout(page);
  const stale = dialog.getByRole("table", { name: "설치 목록" }).locator("tbody tr").filter({ has: page.locator(`[title="${enrolled.installationId}"]`) });
  await expect(stale).toContainText(`v${outdated.row.appliedPolicyVersion}`);
  await expect(stale.getByRole("checkbox")).toBeVisible();
  await closeRollout(page);
  seen("outdated");

  // 4. 로그인한 데몬이 새 판을 받아 적용했고 서버가 확인했다.
  const applied = await reached<{ row: Row }>("applied");
  await page.reload();
  await expect(rollout(1, 0, 0)).toBeVisible();
  dialog = await openRollout(page);
  await dialog.getByRole("button", { name: /^적용 1$/ }).click();
  await expect(dialog.getByRole("table", { name: "설치 목록" }).locator("tbody tr").filter({ has: page.locator(`[title="${enrolled.installationId}"]`) }))
    .toContainText(`v${applied.row.appliedPolicyVersion}`);
  await closeRollout(page);
  seen("applied");

  // 5. 업데이트 확인은 데몬 쪽 상태다(화면 없음). 데몬 쪽이 끝날 수 있게 걸음만 맞춘다.
  await reached("updates");
  seen("updates");
  await signOut(page);
});
