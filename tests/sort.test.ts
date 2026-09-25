import assert from "node:assert/strict";
import test from "node:test";
import { nextSort, sortRows, type SortValue } from "../src/lib/sort";
import { buildTeams } from "../src/lib/metrics/teams";
import { buildMembers } from "../src/lib/metrics/members";
import { usd } from "../src/lib/format";

test("sorts raw numeric values, leaves input unchanged and keeps missing values last in both directions", () => {
  const rows: { id: string; value: SortValue }[] = [
    { id: "missing", value: null }, { id: "large", value: 1200 }, { id: "small", value: 90 },
    { id: "zero", value: 0 }, { id: "negative", value: -2 }, { id: "nan", value: NaN },
  ];
  const original = rows.map((row) => row.id);
  const sorted = (direction: "asc" | "desc") => sortRows(rows, (row) => row.value, direction, (row) => row.id).map((row) => row.id);
  assert.deepEqual(sorted("asc"), ["negative", "zero", "small", "large", "missing", "nan"]);
  assert.deepEqual(sorted("desc"), ["large", "small", "zero", "negative", "missing", "nan"]);
  assert.deepEqual(rows.map((row) => row.id), original);
});

test("text sorting handles Korean and numeric names and has deterministic ties", () => {
  const rows = ["팀10", "팀2", "가팀", "나팀"].map((name) => ({ name }));
  assert.deepEqual(sortRows(rows, (row) => row.name, "asc", (row) => row.name).map((row) => row.name), ["가팀", "나팀", "팀2", "팀10"]);
  for (const direction of ["asc", "desc"] as const) assert.deepEqual(sortRows([{ id: "b" }, { id: "a" }], () => 5, direction, (row) => row.id).map((row) => row.id), ["a", "b"]);
  assert.deepEqual(nextSort({ key: "name", direction: "asc" }, "name", "asc"), { key: "name", direction: "desc" });
  assert.deepEqual(nextSort({ key: "name", direction: "desc" }, "cost", "desc"), { key: "cost", direction: "desc" });
});

test("team values remain numeric and missing comparisons are not sorted as zero", () => {
  const model = buildTeams("none");
  for (const axis of Object.values(model.axes)) {
    assert.ok(axis.rows.every((row) => row.deltaValue === null));
    assert.ok(axis.rows.every((row) => Number.isFinite(row.totalValue) && Number.isFinite(row.perUserValue) && Number.isFinite(row.unitValue)));
  }
  const members = buildMembers(undefined, { assigned: {}, invites: [{ email: "waiting@example.com", team: "", role: "member", invitedAt: "2026-09-13" }] });
  assert.equal(members.memberRows.find((row) => row.invited)!.costValue, null);
  assert.equal(members.memberRows.find((row) => row.invited)!.idleDays, null);
});

test("usage subtotal uses the displayed rows after sorting and pagination", () => {
  const model = buildTeams();
  const data = model.users(model.teams[0].team);
  const selected = [...data.rows].sort((a, b) => b.costValue - a.costValue).slice(0, 3);
  const total = selected.reduce((sum, row) => sum + row.costValue, 0);
  assert.ok(data.sumNote(selected).startsWith(`3명 합계 ${usd(total)} · 팀 전체`));
});
