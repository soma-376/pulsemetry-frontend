import assert from "node:assert/strict";
import test from "node:test";
import { teamFormSchema } from "../src/lib/schemas/team";
import { INITIAL_ORGANIZATION, saveTeam } from "../src/lib/organization";

test("team names allow descriptive names and common separators", () => {
  for (const name of ["플랫폼-1", "Frontend_2", "R&D", "AI/ML", "개발팀 (서울)", "Platform.V2", "123", "a".repeat(40)]) {
    assert.equal(teamFormSchema.safeParse({ name }).success, true, name);
  }
  assert.equal(teamFormSchema.parse({ name: "  새 프로젝트  " }).name, "새 프로젝트");
});

test("team names reject emoji sequences, symbols alone, invisible characters and incomplete Korean", () => {
  for (const name of ["🚀", "개발팀🚀", "팀🇰🇷", "팀👩‍💻", "팀1️⃣", "팀❤️", "팀👍🏽", "팀©", "---", "_ . & / ( )", "ㅋㅋㅋ", "^_^", "플랫폼\u200b", "\u3164", "개발\t팀", "개발\n팀", "미배정", " ", "a".repeat(41)]) {
    assert.equal(teamFormSchema.safeParse({ name }).success, false, JSON.stringify(name));
  }
});

test("both creation and rename reject invalid names before changing organization state", () => {
  const state = structuredClone(INITIAL_ORGANIZATION);
  assert.throws(() => saveTeam(state, { name: "개발팀🚀" }, "new", false));
  assert.throws(() => saveTeam(state, { name: "개발팀🚀" }, "team-1", true));
  assert.deepEqual(state, INITIAL_ORGANIZATION);
});
