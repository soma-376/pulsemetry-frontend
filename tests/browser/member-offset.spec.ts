import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";
import { openDashboard } from "./helpers";
import { fixtureMembers, mockMembers } from "./members-fixture";

test("member pages load on demand and detail and CSV include members outside the first page", async ({
  page,
}) => {
  const roster = fixtureMembers(),
    requests: URL[] = [];
  await mockMembers(page, { members: roster });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.includes("/api/") && url.pathname.endsWith("/members"))
      requests.push(url);
  });
  await openDashboard(page, "/members");
  const list = page.getByRole("region", { name: "구성원 목록", exact: true });
  const rows = list.getByRole("button", { name: /구성원 상세$/ });
  await expect(rows).toHaveCount(20);
  expect(requests).toHaveLength(0);
  await list
    .getByRole("button", { name: "다음 20명 더보기", exact: true })
    .click();
  await expect(rows).toHaveCount(40);
  expect(requests.map((u) => u.searchParams.get("offset"))).toEqual(["20"]);
  expect(requests[0].searchParams.get("snapshotId")).toBe("fixture-members");
  await rows.nth(39).click();
  await expect(page.getByRole("dialog")).toContainText("user40@codeworks.io");
  await expect
    .poll(() =>
      requests.some((u) => u.searchParams.get("memberId") === "member-40"),
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  const downloadPromise = page.waitForEvent("download");
  await list
    .getByRole("button", { name: "전체 명단 CSV", exact: true })
    .click();
  const download = await downloadPromise;
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv.trim().split(/\r?\n/)).toHaveLength(46);
  for (const member of roster) expect(csv).toContain(member.account);
  expect(requests.at(-1)!.searchParams.get("limit")).toBe("100");
  await list.getByRole("textbox", { name: "구성원 검색" }).fill("user45");
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("user45@codeworks.io");
  expect(requests.at(-1)!.searchParams.get("offset")).toBe("0");
  expect(requests.at(-1)!.searchParams.get("q")).toBe("user45");
});
