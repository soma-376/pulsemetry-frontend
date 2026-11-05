import { test, expect } from "@playwright/test";
import {
  downloadedCsv,
  readySessionPreservation,
  sessionPreservationTests,
} from "../fixtures/session-preservation-browser";
import { fixtureMembers, mockMembers } from "./members-fixture";
sessionPreservationTests("day");

test("구성원 세션 결손·0원·미환산의 활성 관측과 CSV는 데스크톱·모바일에서 유지한다", async ({
  page,
}) => {
  const members = fixtureMembers(3).sort((a, b) =>
    a.account.localeCompare(b.account),
  );
  members[0].periodUsage = {
    equivalentCostUsd: { value: "12.345678", status: "complete", reasons: [] },
    sessionCount: {
      value: null,
      status: "unavailable",
      reasons: ["session_identity_missing"],
    },
  };
  members[1].periodUsage = {
    equivalentCostUsd: { value: "0.000000", status: "complete", reasons: [] },
    sessionCount: { value: 0, status: "complete", reasons: [] },
  };
  members[2].periodUsage = {
    equivalentCostUsd: {
      value: null,
      status: "unavailable",
      reasons: ["pricing_missing"],
    },
    sessionCount: {
      value: null,
      status: "unavailable",
      reasons: ["session_identity_missing"],
    },
  };
  await mockMembers(page, { members, candidates: false });
  await readySessionPreservation(page, "http://localhost:3107");
  await page.goto("/members?startDate=2026-09-01&endDate=2026-09-30");
  const roster = page.getByRole("region", { name: "구성원 목록", exact: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const member of members) {
      const row = roster.getByRole("button", {
        name: `${member.account} 구성원 상세`,
      });
      await expect(row.getByText("활성", { exact: true })).toBeVisible();
      await expect(row).not.toContainText("기간 내 미관측");
    }
    await expect(
      roster.getByRole("button", { name: `${members[0].account} 구성원 상세` }),
    ).toContainText("$12.35");
    await expect(
      roster.getByRole("button", { name: `${members[1].account} 구성원 상세` }),
    ).toContainText("$0.00");
    const csv = await downloadedCsv(page);
    expect(csv).toContain(
      "기간 세션,마지막 사용(UTC),비용 상태,비용 사유,세션 상태,세션 사유",
    );
    expect(csv).toMatch(
      /활성,12.345678,,.*complete,,unavailable,session_identity_missing/,
    );
    expect(csv).toMatch(/활성,0,0,.*complete,,complete,/);
    expect(csv).toMatch(
      /활성,,,.*unavailable,pricing_missing,unavailable,session_identity_missing/,
    );
    const row = roster.getByRole("button", {
      name: `${members[0].account} 구성원 상세`,
    });
    await row.click();
    const drawer = page.getByRole("dialog");
    await expect(
      drawer.getByRole("region", { name: "팀 및 역할" }),
    ).toContainText(members[0].displayName);
    await expect(
      drawer.getByRole("button", { name: "설치 코드", exact: true }),
    ).toBeVisible();
    await expect(
      drawer.getByRole("button", { name: "벤더 좌석", exact: true }),
    ).toBeVisible();
    await drawer
      .getByRole("button", { name: "상세 패널 닫기", exact: true })
      .click();
  }
});
