import { DAY_MS, fromIso, toIso } from "@/lib/date";
import { demoVendorUsage } from "./vendor-usage";
import {
  DAILY_LISTED,
  MODEL_META,
  MODEL_SHARE,
  ORG,
  TEAM_SOURCES,
  UNATTRIBUTED_GAIN_WEIGHT,
} from "./overview";

export const SAMPLE_START = "2026-07-13";
export const SAMPLE_END = "2026-09-13";

// Reproducible demo activity, not production telemetry. All widgets aggregate these same records.
const baseline = DAILY_LISTED.reduce((sum, value) => sum + value, 0);
const weight = TEAM_SOURCES.reduce((sum, team) => sum + team.costW, 0);
const sources = [
  ...TEAM_SOURCES,
  { team: "미배정", users: ORG.unmappedUsers, costW: 0, gainW: UNATTRIBUTED_GAIN_WEIGHT, cause: "팀 귀속 실패" },
];

/** 팀의 기본 비용 몫 — 인원·활동량이 반영된 정적 비중 */
const baseShare = (team: (typeof sources)[number]) =>
  team.team === "미배정"
    ? ORG.unattributedShare
    : (1 - ORG.unattributedShare) * team.costW / weight;

/**
 * 팀마다 다른 성장 속도.
 *
 * 이게 없으면 모든 팀이 전사와 똑같은 비율로 자라서 "전주 대비"와 "증가 기여" 열이
 * 전 행 같은 값이 됩니다 — 어느 팀이 증가를 끌고 있는지가 질문의 핵심인데 답이 사라집니다.
 * gainW 는 그 답을 적어둔 값이라 여기서 기울기로 씁니다.
 */
const tilt = (team: (typeof sources)[number], day: number) =>
  1 + (team.gainW / 200) * (day / 62);

export const ACTIVITY = Array.from({ length: 63 }, (_, day) => {
  const date = toIso(new Date(fromIso(SAMPLE_START).getTime() + day * DAY_MS));
  const trend = 0.76 + day / 220;
  const cost = DAILY_LISTED[day % DAILY_LISTED.length] * trend;
  // 기울기를 준 뒤 다시 정규화합니다 — 팀 간 몫만 움직이고 전사 일별 총액은 그대로입니다
  const shareSum = sources.reduce((sum, team) => sum + baseShare(team) * tilt(team, day), 0);
  const teams = sources.map((team, index) => {
    const teamCost = cost * baseShare(team) * tilt(team, day) / shareSum;
    const shares = MODEL_META.map((model, m) => ({
      ...model,
      weight: MODEL_SHARE[team.team][model.v] * (1 + 0.18 * Math.sin(day / 8 + m + index)),
    }));
    const total = shares.reduce((sum, model) => sum + model.weight, 0);
    const models = shares.map((model) => ({ key: model.v, cost: teamCost * model.weight / total }));
    // 토큰은 비용에서 모델 단가로 되돌려 구합니다: cost = tokens × 단가 이므로 tokens = cost ÷ 단가.
    // 비용에 정비례로 두면 모든 팀의 "백만당 비용"이 같은 값이 되어, 비싼 모델을 쓰는 팀을
    // 가려내는 열이 통째로 무의미해집니다.
    const tokensM = shares.reduce(
      (sum, model, m) => sum + models[m].cost / model.perM,
      0,
    );
    const sessions = Math.round(teamCost / baseline * ORG.sessions);
    const users = Array.from({ length: team.users }, (_, user) => user).filter((user) => (user + day + index) % 4 !== 0);
    return {
      team: team.team,
      cause: team.cause,
      cost: teamCost,
      users,
      sessions,
      tokensM,
      models,
      // Explicit demo product observations; independent of model names and seat assignments.
      vendors: demoVendorUsage(team.team, day, { cost: teamCost, tokensM, sessions }).map((vendor, position) => ({
        ...vendor,
        users: users.filter((user) => (user + day) % 3 !== position).map((user) => `${team.team}:${user}`),
      })),
    };
  });
  return { date, teams };
});
