import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultDashboardFilters,
  readFilterQuery,
  withFilterQuery,
} from "../src/lib/filter-query";

test("이번 주는 월요일~오늘이며 월요일·일요일·연도 경계를 처리한다", () => {
  assert.deepEqual(defaultDashboardFilters("2026-10-03"), {
    dates: { start: "2026-09-28", end: "2026-10-03" },
    compare: "prev_week",
  });
  assert.equal(defaultDashboardFilters("2026-09-28").dates.start, "2026-09-28");
  assert.equal(defaultDashboardFilters("2026-10-04").dates.start, "2026-09-28");
  assert.equal(defaultDashboardFilters("2027-01-01").dates.start, "2026-12-28");
});
test("URL의 유효한 기간·비교를 복원하고 미래 날짜도 허용한다", () => {
  assert.deepEqual(
    readFilterQuery(
      new URLSearchParams(
        "startDate=2027-02-01&endDate=2027-02-28&compare=none",
      ),
      "2026-10-03",
    ),
    {
      dates: { start: "2027-02-01", end: "2027-02-28" },
      compare: "none",
    },
  );
  assert.equal(
    readFilterQuery(
      new URLSearchParams(
        "startDate=2024-01-01&endDate=2024-12-31&compare=prev_period",
      ),
      "2026-10-03",
    ).dates.start,
    "2024-01-01",
  );
});
test("존재하지 않는 날짜·역전·366일 초과·중복·불완전한 기간은 기본 기간으로 복구한다", () => {
  for (const query of [
    "",
    "startDate=2026-02-30&endDate=2026-03-02",
    "startDate=2026-10-03&endDate=2026-09-28",
    "startDate=2024-01-01&endDate=2025-01-01",
    "startDate=2026-09-01",
    "startDate=2026-09-01&startDate=2026-09-02&endDate=2026-09-03",
  ]) {
    assert.deepEqual(
      readFilterQuery(new URLSearchParams(query), "2026-10-03").dates,
      defaultDashboardFilters("2026-10-03").dates,
    );
  }
  for (const query of ["compare=invalid", "compare=none&compare=prev_week"]) {
    assert.equal(
      readFilterQuery(new URLSearchParams(query), "2026-10-03").compare,
      "prev_week",
    );
  }
});
test("필터를 바꿔도 벤더·팀·초대 파라미터와 해시를 보존하고 중복 필터는 정리한다", () => {
  const filters = defaultDashboardFilters("2026-10-03");
  const result = withFilterQuery(
    "/settings?vendor=a%2Fb&startDate=bad&startDate=bad2#collection",
    filters,
  );
  const url = new URL(result, "http://localhost");
  assert.equal(url.searchParams.get("vendor"), "a/b");
  assert.deepEqual(url.searchParams.getAll("startDate"), ["2026-09-28"]);
  assert.equal(url.hash, "#collection");
  assert.equal(
    new URL(
      withFilterQuery("/members?invite=1", filters),
      url,
    ).searchParams.get("invite"),
    "1",
  );
  assert.equal(
    new URL(withFilterQuery("/teams?team=t1", filters), url).searchParams.get(
      "team",
    ),
    "t1",
  );
});
