import assert from "node:assert/strict";
import test from "node:test";
import { nextSort, sortRows, type SortValue } from "../src/lib/sort";

test("sorts raw numeric values, leaves input unchanged and keeps missing values last in both directions", () => {
  const rows: { id: string; value: SortValue }[] = [
    { id: "missing", value: null },
    { id: "large", value: 1200 },
    { id: "small", value: 90 },
    { id: "zero", value: 0 },
    { id: "negative", value: -2 },
    { id: "nan", value: NaN },
  ];
  const original = rows.map((row) => row.id);
  const sorted = (direction: "asc" | "desc") =>
    sortRows(
      rows,
      (row) => row.value,
      direction,
      (row) => row.id,
    ).map((row) => row.id);
  assert.deepEqual(sorted("asc"), [
    "negative",
    "zero",
    "small",
    "large",
    "missing",
    "nan",
  ]);
  assert.deepEqual(sorted("desc"), [
    "large",
    "small",
    "zero",
    "negative",
    "missing",
    "nan",
  ]);
  assert.deepEqual(
    rows.map((row) => row.id),
    original,
  );
});

test("text sorting handles Korean and numeric names and has deterministic ties", () => {
  const rows = ["팀10", "팀2", "가팀", "나팀"].map((name) => ({ name }));
  assert.deepEqual(
    sortRows(
      rows,
      (row) => row.name,
      "asc",
      (row) => row.name,
    ).map((row) => row.name),
    ["가팀", "나팀", "팀2", "팀10"],
  );
  for (const direction of ["asc", "desc"] as const)
    assert.deepEqual(
      sortRows(
        [{ id: "b" }, { id: "a" }],
        () => 5,
        direction,
        (row) => row.id,
      ).map((row) => row.id),
      ["a", "b"],
    );
  assert.deepEqual(nextSort({ key: "name", direction: "asc" }, "name", "asc"), {
    key: "name",
    direction: "desc",
  });
  assert.deepEqual(
    nextSort({ key: "name", direction: "desc" }, "cost", "desc"),
    { key: "cost", direction: "desc" },
  );
});
