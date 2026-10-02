import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test, seedOrganizations } from "../e2e/fixtures";
import { signIn, signOut } from "../e2e/helpers";

// telemetryctl 기본 브랜치의 데몬 코드가 시드 B에 설치를 등록하고 OTLP를 전달하고 업데이트를 확인하는 동안, 단계마다 화면이 서버의 판정을 따르는지 본다.
// 그 데몬은 설치 보고를 보내지 않는다(백엔드 ADR 0053) — 적용 판은 확인 불가이고, 수신이 있어도 보고 없이 "수집 정상"이라고 하지 않는다.
// 걸음은 단계 디렉터리의 파일로 맞춘다: 데몬 쪽이 <단계>.ready(관찰값 JSON)를 쓰면 화면을 확인하고 <단계>.seen을 쓴다.
// 기대값은 대시보드 명세의 판정 규칙이다 — 수신 이력이 없으면 수신 대기, 수집 중이라고 보고한 설치가 없으면 확인 불가(source_not_available).
// 정책 적용의 근거도 명세 표대로다 — 설치 보고도 적용 확인 기록도 없는 설치는 근거 없음(`none`, 판 null·`unknown`)이고 근거 시각이 없다.
const B = seedOrganizations[1];
const ROLLOUT = "적용 0대 · 미적용 0대 · 확인 불가 1대 · 근거: 근거 없음 1대 — 설치 보고를 받은 설치가 없습니다";

function stageDir() {
  const dir = process.env.E2E_DAEMON_STAGE_DIR;
  if (!dir) throw new Error("E2E 선행 조건 실패: E2E_DAEMON_STAGE_DIR에 데몬 쪽(백엔드 명세 §10.2)이 단계 파일을 쓰는 디렉터리를 주고 함께 돌리세요.");
  return dir;
}
async function reached<T>(name: string): Promise<T> {
  const file = join(stageDir(), `${name}.ready`);
  await expect.poll(() => existsSync(file), { timeout: 6 * 60_000, intervals: [1000], message: `데몬 단계 ${name}` }).toBe(true);
  return JSON.parse(readFileSync(file, "utf8")) as T;
}
const seen = (name: string) => writeFileSync(join(stageDir(), `${name}.seen`), new Date().toISOString());

async function openRollout(page: Page) {
  await page.getByRole("button", { name: "정책 적용 현황 보기", exact: true }).click();
  return page.getByRole("dialog", { name: "수집 정책 적용 현황", exact: true });
}

test("DAEMON-FLOW @p0 @write 데몬의 등록·전달·업데이트 확인이 헤더와 정책 적용 현황에 근거대로 나타난다", async ({ page }) => {
  const bar = page.getByLabel("조직 수집 현황", { exact: true });

  // 1. 등록 직후 — 수신 이력이 없고, 설치는 보고하지 않아 적용 판을 확인할 수 없다.
  const enrolled = await reached<{ installationId: string }>("enrolled");
  await signIn(page, `owner@seed-${B.seed}.example.test`);
  await page.goto("/settings");
  await expect(page.getByText(ROLLOUT, { exact: true })).toBeVisible();
  await expect(bar).toContainText("수신 대기");
  await expect(bar).toContainText("아직 수집된 데이터가 없습니다");
  await expect(bar).not.toContainText("보고 중인 설치");
  const dialog = await openRollout(page);
  await dialog.getByRole("button", { name: /^확인 불가 1$/ }).click();
  const row = dialog.getByRole("table", { name: "설치 목록" }).locator("tbody tr").filter({ has: page.locator(`[title="${enrolled.installationId}"]`) });
  await expect(row).toContainText("확인 불가");
  await expect(row.locator("td").nth(5)).toHaveText("근거 없음");
  await expect(row.locator("td").last()).toHaveText("-");
  await dialog.getByRole("button", { name: "닫기", exact: true }).last().click();
  seen("enrolled");

  // 2. 전달 — 수집 서버가 받았다. 수집 중이라고 보고한 설치가 없으니 정상·지연을 판정하지 않고 마지막 수신만 말한다.
  await reached("collecting");
  await expect(async () => {
    await page.reload();
    await expect(bar).toContainText("마지막 수신", { timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  await expect(bar).toContainText("수집 상태 확인 불가");
  await expect(bar).toContainText("수집 기기의 보고가 없어 판정할 수 없습니다");
  await expect(bar).not.toContainText("수집 정상");
  await expect(page.getByText(ROLLOUT, { exact: true })).toBeVisible();
  seen("collecting");

  // 3. 업데이트 확인은 데몬 쪽 상태다(화면 없음). 데몬 쪽이 끝날 수 있게 걸음만 맞춘다.
  await reached("updates");
  seen("updates");
  await signOut(page);
});
