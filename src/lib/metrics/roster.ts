/**
 * 사용자 명단 — P2 팀 분석과 P6 구성원이 공유합니다.
 *
 * 두 페이지가 각자 명단을 만들면 같은 사람이 페이지마다 다른 비용을 갖게 됩니다.
 * 그래서 생성기를 여기 하나만 둡니다.
 *
 * 팀 집계를 개인으로 쪼개되 자식의 합이 팀 값과 정확히 일치해야 하므로,
 * 가중치는 평균 1.0 으로 정규화하고 세션은 최대잉여법으로 나눕니다.
 */

/** 데모용 계정 이름 풀 — 실제 조직에서는 IdP 가 내려주는 값으로 대체됩니다 */
const GIVEN = [
  "jiwon", "seoyeon", "minjun", "haeun", "doyun", "sujin", "taehyun", "yerin",
  "junho", "chaewon", "sihoon", "dain", "woojin", "nayeon", "gunwoo", "soeun",
];
const FAMILY = ["kim", "lee", "park", "choi", "jung", "kang", "cho", "yoon"];

const COMBOS = GIVEN.length * FAMILY.length;

/**
 * 전역 일련번호로 계정을 만듭니다.
 *
 * 팀별 시드로 뽑으면 팀이 달라도 같은 이름이 나옵니다 — 구성원 목록에 같은 이메일이
 * 두 번 등장하면 그 표는 못 믿습니다. 조합을 순서대로 모두 소진한 뒤에야
 * 번호를 붙이는 방식이라 명단 전체에서 유일합니다.
 */
function accountName(globalIndex: number) {
  const given = GIVEN[globalIndex % GIVEN.length];
  const family = FAMILY[Math.floor(globalIndex / GIVEN.length) % FAMILY.length];
  const cycle = Math.floor(globalIndex / COMBOS);
  return `${given}.${family}${cycle ? cycle + 1 : ""}@codeworks.io`;
}

/**
 * 팀별 시작 번호 — 팀 순서가 같아야 P2 와 P6 이 같은 명단을 봅니다.
 * aggregateActivity 가 돌려주는 순서를 그대로 씁니다.
 */
export function rosterOffsets(teams: { team: string; users: number }[]) {
  const offsets: Record<string, number> = {};
  let running = 0;
  for (const team of teams) {
    offsets[team.team] = running;
    running += Math.max(1, team.users);
  }
  return offsets;
}

/** 이 비율의 계정은 장기 미사용으로 둡니다 — 좌석 회수 판정을 시연하기 위한 값입니다 */
const DORMANT_RATIO = 0.92;

export type TeamAggregate = {
  team: string;
  users: number;
  cost: number;
  tokensM: number;
  sessions: number;
  models: Record<string, number>;
};

export type RosterModel = { key: string; name: string };

export type RosterUser = ReturnType<typeof buildRoster>[number];

export function buildRoster(
  team: TeamAggregate,
  models: RosterModel[],
  /** 이 팀의 첫 계정이 받을 전역 번호 — rosterOffsets 로 구합니다 */
  startIndex = 0,
) {
  const count = Math.max(1, team.users);

  // 팀 이름에서 시드를 만들어 새로고침해도 같은 명단이 나오게 합니다
  const seed = [...team.team].reduce((n, c) => n + c.charCodeAt(0), 0);
  const rnd = (i: number) => {
    const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };

  const raw = Array.from({ length: count }, (_, i) => 0.45 + rnd(i) * 1.35);
  const rawSum = raw.reduce((a, b) => a + b, 0);
  const weights = raw.map((x) => (x * count) / rawSum);

  const avgCost = team.cost / count;
  const avgTokens = team.tokensM / count;
  const avgSessions = team.sessions / count;

  // 세션 정수 배분: 내림한 뒤 소수부가 큰 순으로 남은 개수를 나눠 줍니다.
  // 개별 반올림은 합계를 팀 값과 어긋나게 만듭니다.
  const sessionTarget = Math.round(team.sessions);
  const sessionRaw = weights.map((w) => avgSessions * w);
  const sessions = sessionRaw.map((v) => Math.max(1, Math.floor(v)));
  const order = sessionRaw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  let left = sessionTarget - sessions.reduce((a, b) => a + b, 0);
  for (let k = 0; left > 0 && order.length; k += 1, left -= 1) {
    sessions[order[k % order.length].i] += 1;
  }
  for (let k = 0; left < 0 && k < order.length * 3; k += 1) {
    const idx = order[order.length - 1 - (k % order.length)].i;
    if (sessions[idx] > 1) {
      sessions[idx] -= 1;
      left += 1;
    }
  }

  // 그 팀이 실제로 많이 쓰는 모델 중에서 고릅니다 — 안 쓰는 모델이 배정되면 거짓이 됩니다
  const ranked = [...models].sort(
    (a, b) => (team.models[b.key] ?? 0) - (team.models[a.key] ?? 0),
  );

  return weights.map((w, i) => {
    const deviation = w - 1;
    const cache = 0.52 + rnd(i + 100) * 0.38;

    /*
      미사용 일수.
      데모 텔레메트리는 모든 계정이 나흘 안에 한 번은 나타나도록 생성돼 있어
      장기 휴면이 존재하지 않습니다. 좌석 회수는 휴면이 있어야 성립하는 기능이라
      일부를 장기 미사용으로 둡니다. 실제 연동에서는 last_seen 이 그대로 들어옵니다.
    */
    const roll = rnd(i + 200);
    const idleDays =
      roll > DORMANT_RATIO
        ? 15 + Math.floor(rnd(i + 400) * 56)
        : Math.floor(roll * 9);

    const picked = ranked[Math.floor(rnd(i + 300) * Math.min(2, ranked.length))] ?? ranked[0];

    return {
      key: `${team.team}-${i}`,
      team: team.team,
      account: accountName(startIndex + i),
      sessionCount: sessions[i],
      tokenValue: avgTokens * w,
      costValue: avgCost * w,
      cacheValue: cache,
      /** 팀 평균 대비 편차 (0.35 = +35%) */
      deviation,
      modelName: picked ? picked.name : "—",
      idleDays,
    };
  });
}
