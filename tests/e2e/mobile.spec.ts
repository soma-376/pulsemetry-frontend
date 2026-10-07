import type { Page } from "@playwright/test";
import { expect, test, seedOrganizations } from "./fixtures";
import { seedPeriod, selectPeriod, signIn } from "./helpers";

// 작은 화면(390×844, @mobile) — 읽기 전용 핵심 화면이 가로로 넘치지 않고, 드로어는 끝까지 스크롤되며 닫힌다. 쓰기 시험은 반복하지 않는다.
test.use({ viewport: { width: 390, height: 844 } });
const [A] = seedOrganizations;

/** 문서가 화면 폭보다 넓지 않다 — 가로 스크롤이 생기지 않는다. */
async function fitsWidth(page: Page) {
  const { scroll, width } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  expect(scroll, `문서 폭 ${scroll} > 화면 ${width}`).toBeLessThanOrEqual(
    width,
  );
}
/** 드로어 본문을 끝까지 내려 마지막 요소가 보이고, 닫기 버튼으로 닫힌다. */
async function scrollAndClose(
  page: Page,
  dialog: ReturnType<Page["getByRole"]>,
) {
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  await dialog.evaluate((element) => {
    for (const node of [element, ...element.querySelectorAll("*")])
      if (
        node.scrollHeight > node.clientHeight + 1 &&
        getComputedStyle(node).overflowY !== "visible"
      )
        node.scrollTop = node.scrollHeight;
  });
  await expect(
    dialog.getByRole("button", { name: "상세 패널 닫기", exact: true }),
  ).toBeInViewport();
  await dialog
    .getByRole("button", { name: "상세 패널 닫기", exact: true })
    .click();
  await expect(dialog).toBeHidden();
}

test("MOBILE-OVERVIEW-A @p1 @read @mobile 개요·팀은 작은 화면에서 가로로 넘치지 않고 핵심 지표가 보인다", async ({
  page,
}) => {
  const { start, end } = seedPeriod();
  await signIn(page, `owner@seed-${A.seed}.example.test`);
  await selectPeriod(page, start, end);
  await expect(
    page.getByRole("region", { name: "사용 관측 인원", exact: true }),
  ).toBeVisible();
  await fitsWidth(page);
  await page.goto("/teams");
  await expect(
    page.getByRole("heading", { name: "팀 분석", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "팀별 사용량 비교", exact: true }),
  ).toBeVisible();
  await fitsWidth(page);
});

test("MOBILE-MEMBERS-A @p1 @read @mobile 구성원 명단과 상세 드로어는 작은 화면에서 끝까지 스크롤되고 닫힌다", async ({
  page,
}) => {
  await signIn(page, `owner@seed-${A.seed}.example.test`);
  await page.goto("/members");
  const list = page.getByRole("region", { name: "구성원 목록", exact: true });
  await expect(
    list.getByRole("button", { name: / 구성원 상세$/ }).first(),
  ).toBeVisible();
  await fitsWidth(page);
  await list
    .getByRole("button", { name: / 구성원 상세$/ })
    .first()
    .click();
  await scrollAndClose(
    page,
    page.getByRole("dialog", { name: "구성원 상세", exact: true }),
  );
});

test("MOBILE-SETTINGS-A @p1 @read @mobile 설정과 계약 드로어는 작은 화면에서 끝까지 스크롤되고 닫힌다", async ({
  page,
}) => {
  await signIn(page, `owner@seed-${A.seed}.example.test`);
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "설정", exact: true }),
  ).toBeVisible();
  await fitsWidth(page);
  const open = page.getByRole("button", { name: /계약 설정 열기$/ }).first();
  const name = (await open.getAttribute("aria-label"))!.replace(
    / 계약 설정 열기$/,
    "",
  );
  await open.click();
  await scrollAndClose(
    page,
    page.getByRole("dialog", { name: `${name} 계약 설정`, exact: true }),
  );
});
