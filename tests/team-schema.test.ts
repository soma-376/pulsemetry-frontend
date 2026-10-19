import assert from "node:assert/strict";
import test from "node:test";
import { teamFormSchema } from "../src/lib/schemas/team";
import { teamSchema } from "../src/lib/api/management";
import { parseJsonExactIntegers } from "../src/lib/exact-numbers";

test("team directory keeps zero and exact member counts distinct from an older response without counts", () => {
  const team = { teamId: "team-a", teamName: "플랫폼", version: 1 };
  assert.equal(teamSchema.parse(team).memberCount, undefined);
  assert.equal(teamSchema.parse({ ...team, memberCount: 0 }).memberCount, 0);
  assert.equal(teamSchema.parse({ ...team, memberCount: 53 }).memberCount, 53);
  const exact = parseJsonExactIntegers(
    '{"teamId":"a","teamName":"플랫폼","version":1,"memberCount":9007199254740993}',
  );
  assert.equal(teamSchema.parse(exact).memberCount, BigInt("9007199254740993"));
  for (const memberCount of [-1, 1.5, null, "53", Number.MAX_SAFE_INTEGER + 1])
    assert.equal(teamSchema.safeParse({ ...team, memberCount }).success, false);
});

test("team names allow descriptive names and common separators", () => {
  for (const name of [
    "플랫폼-1",
    "Frontend_2",
    "R&D",
    "AI/ML",
    "개발팀 (서울)",
    "Platform.V2",
    "123",
    "a".repeat(40),
  ]) {
    assert.equal(teamFormSchema.safeParse({ name }).success, true, name);
  }
  assert.equal(
    teamFormSchema.parse({ name: "  새 프로젝트  " }).name,
    "새 프로젝트",
  );
});

test("team names reject emoji sequences, symbols alone, invisible characters and incomplete Korean", () => {
  for (const name of [
    "🚀",
    "개발팀🚀",
    "팀🇰🇷",
    "팀👩‍💻",
    "팀1️⃣",
    "팀❤️",
    "팀👍🏽",
    "팀©",
    "---",
    "_ . & / ( )",
    "ㅋㅋㅋ",
    "^_^",
    "플랫폼\u200b",
    "\u3164",
    "개발\t팀",
    "개발\n팀",
    "미배정",
    " ",
    "a".repeat(41),
  ]) {
    assert.equal(
      teamFormSchema.safeParse({ name }).success,
      false,
      JSON.stringify(name),
    );
  }
});
