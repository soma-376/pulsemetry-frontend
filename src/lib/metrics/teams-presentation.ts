import { moneyText, numberText, numeric } from "@/lib/api/overview-format";
import { UNASSIGNED, type TeamAnalytics, type TeamsView, type TeamUser, type TeamUsersPage } from "@/lib/api/teams";
import { int, pct, signedUsd, usd } from "@/lib/format";
import { getVendorProduct } from "@/lib/vendor-catalog";
import { comparisonReason } from "./overview-presentation";

/**
 * P2 팀 분석 — 서버 응답(`GET O/analytics/teams` 등)을 화면 입력으로 바꾼다.
 *
 * 값은 서버가 센 그대로 쓴다. 여기서 하는 계산은 표시용 파생값(사용자당·단가·증감·일별 값의 누적)뿐이고,
 * 필요한 값이 null이면 파생값도 null이다. 0으로 채우거나 다른 값으로 대신하지 않는다.
 *
 * 축이 셋인 이유: 비용만 보면 "인원이 많은 팀"이 항상 1등이라 아무것도 알 수 없다.
 * 토큰은 사용량, 세션은 사용 패턴을 분리해 보여주고, 사용자당 열이 그 셋을 인원수로 나눈다.
 */

export type AxisKey = "cost" | "token" | "session";
type Usage = NonNullable<TeamAnalytics["current"]>;

/** 팀 선 색 — 표의 체크박스 accent 와 추이 선이 같은 색을 쓴다. */
const SERIES = ["var(--purple)", "var(--blue)", "var(--green)", "var(--orange-ink)", "var(--red)", "var(--gray)"];
const MODEL_SERIES = ["var(--purple)", "var(--blue)", "var(--orange)", "var(--green)"];
/** 산점도에서 점을 그리는 상위 모델 수 */
const MODEL_TOP_N = 4;
/** 증가가 이 비율 이상이면 강조한다. */
const RISE_ALERT = 0.1;
/** 신규(이전 0 → 현재 양수)는 어떤 증가율보다 크게 정렬한다. */
const NEW_USAGE = Number.MAX_VALUE;
const UNMAPPED_PRODUCT = "__unmapped";
const UNMAPPED_NAME = "미확인 제품";

export const tokenText = (tokens: number | null | undefined) => {
  if (tokens == null) return "-";
  if (tokens >= 1e9) return `${(tokens / 1e9).toFixed(2)}B`;
  if (tokens >= 1e6) return `${(tokens / 1e6).toFixed(1)}M`;
  if (tokens >= 1e3) return `${(tokens / 1e3).toFixed(1)}K`;
  return int(tokens);
};
const usdText = (value: number | null) => value === null ? "-" : usd(value);
const ratio = (numerator: number | null | undefined, denominator: number | null | undefined) =>
  numerator == null || denominator == null || denominator === 0 ? null : numerator / denominator;
/** 백분율(곱한 뒤 나눈다 — 0.3 × 100 같은 부동소수 오차를 표시에 싣지 않는다). */
const percent = (part: number | null | undefined, whole: number | null | undefined) => ratio(part == null ? null : part * 100, whole);

export function metric(usage: Usage | null | undefined, axis: AxisKey): number | null {
  if (!usage) return null;
  return axis === "cost" ? numeric(usage.equivalentCostUsd) : axis === "token" ? usage.tokens.total : usage.sessionCount;
}

/** 완전 관측된 기간에 사용이 없으면 서버가 0을 준다 — 미배정 행은 실제 사용이 있을 때만 그린다. */
function hasUsage(usage: Usage | null) {
  if (!usage) return false;
  return !(usage.activeUsers === 0 && usage.sessionCount === 0 && usage.tokens.total === 0 && numeric(usage.equivalentCostUsd) === 0);
}

/** 이전 값 대비 증감. 이전이 0이면 비율이 없다(신규·변화 없음). 값이 하나라도 없으면 null. */
function change(now: number | null, before: number | null) {
  if (now === null || before === null) return { value: null, text: "-" };
  if (before === 0) return now === 0 ? { value: 0, text: "변화 없음" } : { value: NEW_USAGE, text: "신규" };
  const value = (now - before) / before;
  return { value, text: pct(value) };
}
const changeColor = (value: number | null) =>
  value === null ? "var(--text3)" : value >= RISE_ALERT ? "var(--red)" : value < 0 ? "var(--green)" : "var(--text3)";

type TeamEntry = { key: string; teamId: string | null; team: string; unmapped: boolean; analytics: TeamAnalytics };
const entryOf = (analytics: TeamAnalytics): TeamEntry => ({
  key: analytics.teamId ?? UNASSIGNED, teamId: analytics.teamId, unmapped: analytics.teamId === null,
  team: analytics.teamId === null ? "미배정" : analytics.teamName, analytics,
});

/** 선택 축의 표시 형식. */
const FORMAT: Record<AxisKey, (value: number | null) => string> = {
  cost: usdText,
  token: tokenText,
  session: (value) => value === null ? "-" : int(Math.round(value)),
};

const AXES: Record<AxisKey, { title: string; c1: string; c2: string; c3: string; bar: string }> = {
  cost: { title: "비용", c1: "총 비용", c2: "사용자당", c3: "세션당", bar: "var(--purple)" },
  token: { title: "토큰", c1: "총 토큰", c2: "사용자당", c3: "백만당 비용", bar: "var(--blue)" },
  session: { title: "세션", c1: "세션", c2: "사용자당", c3: "세션당 토큰", bar: "var(--green)" },
};

/** 사용자당·단가 열. 분모가 0이거나 값이 없으면 null이다. */
function derived(usage: Usage | null, axis: AxisKey) {
  const total = metric(usage, axis);
  const perUser = ratio(total, usage?.activeUsers);
  const cost = numeric(usage?.equivalentCostUsd);
  if (axis === "cost") {
    const unit = ratio(cost, usage?.sessionCount);
    return { total, perUser, unit, v1: usdText(total), v2: usdText(perUser), v3: usdText(unit) };
  }
  if (axis === "token") {
    const perMillion = ratio(cost, usage?.tokens.total);
    const unit = perMillion === null ? null : perMillion * 1_000_000;
    return { total, perUser, unit, v1: tokenText(total), v2: tokenText(perUser === null ? null : Math.round(perUser)), v3: usdText(unit) };
  }
  const unit = ratio(usage?.tokens.total, usage?.sessionCount);
  return { total, perUser, unit, v1: FORMAT.session(total), v2: perUser === null ? "-" : perUser.toFixed(1), v3: tokenText(unit === null ? null : Math.round(unit)) };
}

/**
 * 누적 추이 한 계열. 세션은 서버의 `cumulativeSessionCount`를 그대로 쓴다(여러 날에 걸친 세션을 한 번만 센 값 — 일별 값을 더해 만들지 않는다).
 * 비용·토큰은 일별 값을 더하되, 값이 없는 날(미관측·확인 불가)부터는 선을 끊는다 — 공백 뒤의 합을 확정 누적처럼 잇지 않는다.
 */
export function cumulative(trend: TeamAnalytics["trend"], axis: AxisKey): (number | null)[] {
  if (axis === "session") return trend.map((point) => point.cumulativeSessionCount);
  let running: number | null = 0;
  return trend.map((point) => {
    const value = axis === "cost" ? numeric(point.equivalentCostUsd) : point.totalTokens;
    running = running === null || value === null ? null : running + value;
    return running;
  });
}

type Product = TeamAnalytics["products"][number];
const productKey = (product: Product) => product.kind ?? UNMAPPED_PRODUCT;
const productName = (product: Product) => product.kind === null ? UNMAPPED_NAME : product.displayName ?? product.kind;
const productColor = (product: Product) => product.kind === null ? "var(--gray)" : getVendorProduct(product.kind)?.color ?? "var(--text2)";
const productValue = (product: Product, axis: AxisKey) =>
  axis === "cost" ? numeric(product.equivalentCostUsd) : axis === "token" ? product.totalTokens : product.sessionCount;

/**
 * 팀별 제품 비중. 기둥 높이는 그 팀의 선택 축 값이고, 조각은 서버가 제품별로 센 값이다.
 * 제품 값이 하나라도 없거나 팀 값이 없으면(예: 의미가 다른 토큰은 합치지 않는다) 비중을 그리지 않는다 — 부분합으로 비중을 만들지 않는다.
 */
function productMix(entries: TeamEntry[], axis: AxisKey) {
  const format = FORMAT[axis];
  const legendMap = new Map<string, { id: string; name: string; color: string }>();
  for (const entry of entries) for (const product of entry.analytics.products) {
    if (!legendMap.has(productKey(product))) legendMap.set(productKey(product), { id: productKey(product), name: productName(product), color: productColor(product) });
  }
  // 매핑 없는 관측은 끝에 둔다(서버 순서와 같다).
  const legend = [...legendMap.values()].sort((a, b) => Number(a.id === UNMAPPED_PRODUCT) - Number(b.id === UNMAPPED_PRODUCT));
  const rows = entries.map((entry) => {
    const total = metric(entry.analytics.current, axis);
    const values = entry.analytics.products.map((product) => ({ product, value: productValue(product, axis) }));
    const complete = total !== null && total > 0 && values.length > 0 && values.every((item) => item.value !== null);
    return { entry, total, values, complete };
  }).sort((a, b) => (b.total ?? -1) - (a.total ?? -1) || a.entry.team.localeCompare(b.entry.team, "ko"));
  const max = Math.max(0, ...rows.map((row) => row.total ?? 0));
  return {
    yTop: max > 0 ? format(max) : "", yMid: max > 0 ? format(max / 2) : "", legend,
    incomplete: rows.some((row) => row.entry.analytics.products.length > 0 && !row.complete),
    columns: rows.map(({ entry, total, values, complete }) => {
      const segments = complete ? values.map(({ product, value }) => {
        const share = value! / total!;
        return { key: productKey(product), share, value: value!, color: productColor(product), tip: `${entry.team} · ${productName(product)} ${(share * 100).toFixed(1)}% · ${format(value)}` };
      }) : [];
      const top = [...segments].sort((a, b) => b.value - a.value)[0];
      return {
        key: entry.key, team: entry.team, unmapped: entry.unmapped, totalValue: total,
        height: max > 0 && total !== null ? `${((total / max) * 100).toFixed(1)}%` : "0.0%", totalText: format(total), segments,
        topText: top ? `${legendMap.get(top.key)!.name} ${(top.share * 100).toFixed(0)}%` : entry.analytics.products.length === 0 ? "관측 없음" : "비중 확인 불가",
      };
    }),
  };
}

/** 드로어 한 팀. 목록 행과 상세 조회가 같은 함수를 쓴다. */
export function teamDetail(analytics: TeamAnalytics, comparable: boolean) {
  const entry = entryOf(analytics);
  const current = analytics.current, previous = comparable ? analytics.previous : null;
  const cost = numeric(current?.equivalentCostUsd), before = numeric(previous?.equivalentCostUsd);
  const perUser = ratio(cost, current?.activeUsers), perUserBefore = ratio(before, previous?.activeUsers);
  const models = analytics.modelMix.data?.models ?? [];
  return {
    key: entry.key, team: entry.team, unmapped: entry.unmapped,
    users: numberText(current?.activeUsers), costText: moneyText(current?.equivalentCostUsd), perUserText: usdText(perUser),
    perUserDelta: change(perUser, perUserBefore).text,
    sessions: numberText(current?.sessionCount), tokens: tokenText(current?.tokens.total),
    contribText: cost === null || before === null ? "-" : signedUsd(cost - before),
    models: models.map((model, index) => ({ name: model.displayName, share: percent(numeric(model.equivalentCostUsd), cost), color: MODEL_SERIES[index % MODEL_SERIES.length] })),
    products: analytics.products.map((product) => ({
      key: productKey(product), name: productName(product), share: percent(numeric(product.equivalentCostUsd), cost), color: productColor(product),
      costText: moneyText(product.equivalentCostUsd), users: numberText(product.activeUsers),
    })),
  };
}
export type TeamDetail = ReturnType<typeof teamDetail>;

export function presentTeams(view: TeamsView) {
  const comparable = view.comparison.status === "available";
  const compareLabel = view.comparison.mode === "none" ? "" : view.comparison.mode === "prev_week" ? "전주 대비" : "이전 기간 대비";
  const reason = comparisonReason(view);
  const entries = [...view.teams, ...(hasUsage(view.unassigned.current) ? [view.unassigned] : [])].map(entryOf);

  // 선 색은 비용 내림차순(값 없음은 뒤, 동률은 이름)으로 배정한다 — 축을 바꿔도 같은 팀은 같은 색이다.
  const byCost = [...entries].sort((a, b) => (metric(b.analytics.current, "cost") ?? -1) - (metric(a.analytics.current, "cost") ?? -1) || a.team.localeCompare(b.team, "ko"));
  const colorOf = (key: string) => SERIES[byCost.findIndex((entry) => entry.key === key) % SERIES.length];

  const axisOf = (axis: AxisKey) => {
    const values = entries.map((entry) => derived(entry.analytics.current, axis));
    const max = Math.max(0, ...values.map((value) => value.total ?? 0));
    const totalNow = metric(view.totals.current, axis), totalBefore = comparable ? metric(view.totals.previous, axis) : null;
    const totalChange = change(totalNow, totalBefore);
    return {
      ...AXES[axis], total: FORMAT[axis](totalNow), delta: comparable ? totalChange.text : "", deltaColor: changeColor(totalChange.value),
      format: FORMAT[axis],
      rows: entries.map((entry, index) => {
        const value = values[index];
        const delta = comparable ? change(value.total, metric(entry.analytics.previous, axis)) : { value: null, text: "-" };
        return {
          key: entry.key, team: entry.team, unmapped: entry.unmapped,
          v1: value.v1, v2: value.v2, v3: value.v3,
          totalValue: value.total, perUserValue: value.perUser, unitValue: value.unit, deltaValue: delta.value,
          width: max > 0 && value.total !== null ? `${((value.total / max) * 100).toFixed(1)}%` : "0%",
          // 미배정은 팀이 아니라 "귀속 실패"라서 팀 색을 주지 않는다.
          fill: entry.unmapped ? "var(--gray)" : AXES[axis].bar,
          series: colorOf(entry.key), delta: delta.text, deltaColor: changeColor(delta.value),
        };
      }),
    };
  };
  const axes = { cost: axisOf("cost"), token: axisOf("token"), session: axisOf("session") };

  const dates = (view.teams[0] ?? view.unassigned).trend.map((point) => point.date);
  const trendOf = (axis: AxisKey) => entries.map((entry) => ({ key: entry.key, team: entry.team, color: colorOf(entry.key), values: cumulative(entry.analytics.trend, axis) }));
  const trend = { cost: trendOf("cost"), token: trendOf("token"), session: trendOf("session") };
  const broken = (axis: AxisKey) => trend[axis].some((series) => series.values.some((value) => value === null));
  const trendNote = (axis: AxisKey) => !broken(axis) ? "" : axis === "session"
    ? "누적 세션은 시작일부터 완전하게 수집된 날까지만 그립니다"
    : "값을 확인할 수 없는 날부터 누적선을 끊었습니다";

  // 모델 산점도: x = 토큰(백만), y = 환산 비용. 금액과 토큰이 모두 있는 모델만 점으로 그린다.
  const scatterModels = view.modelScatter.data?.models ?? [];
  const plotted = scatterModels.filter((model) => model.equivalentCostUsd !== null && model.totalTokens !== null && model.totalTokens > 0).slice(0, MODEL_TOP_N);
  const points = plotted.map((model, index) => {
    const cost = Number(model.equivalentCostUsd), tokensM = model.totalTokens! / 1e6, perM = cost / tokensM;
    return {
      key: model.modelId, x: tokensM, y: cost,
      // 점 크기는 세 번째 차원 — 이 모델을 실제로 쓰는 팀 수(모르면 기본 크기)
      size: 12 + (model.usingTeamCount ?? 0) * 3, color: MODEL_SERIES[index % MODEL_SERIES.length],
      label: model.displayName, sub: `${usd(perM)}/M`,
      tip: `${model.displayName} · 토큰 ${tokenText(model.totalTokens)} · 비용 ${usd(cost)} · 백만당 ${usd(perM)} · 사용 팀 ${numberText(model.usingTeamCount)}`,
    };
  });
  const orgCost = numeric(view.totals.current?.equivalentCostUsd), orgTokens = view.totals.current?.tokens.total ?? null;
  const excluded = scatterModels.filter((model) => model.equivalentCostUsd === null || model.totalTokens === null).length;
  const scatter = {
    points,
    xMax: Math.max(...points.map((point) => point.x), 0) * 1.15 || 1,
    yMax: Math.max(...points.map((point) => point.y), 0) * 1.15 || 1,
    /** 전사 평균 단가(백만 토큰당) — 이 기울기가 손익분기선이다. 조직 금액·토큰이 없으면 선을 긋지 않는다. */
    avgPerM: orgCost !== null && orgTokens ? orgCost / (orgTokens / 1e6) : undefined,
    note: view.modelScatter.availability === "unavailable" ? "관측된 모델이 없습니다" : excluded > 0 ? `금액 또는 토큰을 확인할 수 없는 모델 ${excluded}개는 점으로 그리지 않습니다` : "",
  };

  const dayCount = view.meta.dayCount;
  const coverageNote = view.meta.currentCoverage.status === "complete" ? "" : `선택 ${dayCount}일 중 ${view.meta.currentCoverage.observedDays}일 관측`;
  return {
    snapshotId: view.meta.snapshotId,
    isEmpty: entries.length === 0,
    neverObserved: view.meta.dataState === "never_observed",
    periodLabel: `${view.meta.startDate} ~ ${view.meta.endDate}`,
    headerNote: [`팀별 비교 · ${view.meta.startDate} ~ ${view.meta.endDate}`, compareLabel, coverageNote].filter(Boolean).join(" · "),
    compareLabel, showDelta: comparable, comparisonReason: reason,
    teams: byCost.map((entry) => ({ key: entry.key, team: entry.team, color: colorOf(entry.key) })),
    axes, dayLabels: dates.map((date) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`), trend, trendNote,
    scatter, productMix: (axis: AxisKey) => productMix(entries, axis),
    details: entries.map((entry) => teamDetail(entry.analytics, comparable)),
  };
}
export type TeamsModel = ReturnType<typeof presentTeams>;

/**
 * 사용자별 사용량. 서버 순서(비용 내림차순)의 페이지를 이어 붙인 행이다. "평균 대비"는 서버의 평균(식별된 사용자 금액 합 / 식별된 사용자 수)과의 차이다.
 * 캐시 적중은 서버가 준 비율이다 — 사용자 비율을 평균해 팀 비율을 만들지 않는다.
 */
export function presentUsers(pages: TeamUsersPage[]) {
  const first = pages[0];
  const summary = first?.summary;
  const average = numeric(summary?.averageEquivalentCostUsd);
  const endDate = first?.meta.endDate;
  const rows = pages.flatMap((page) => page.users.items).map((user) => userRow(user, average, endDate));
  const teamCost = numeric(summary?.usage?.equivalentCostUsd), unidentified = numeric(summary?.unidentifiedEquivalentCostUsd);
  return {
    team: first?.team.teamId === null ? "미배정" : first?.team.teamName ?? "",
    rows, totalCount: first?.users.totalCount ?? 0,
    note: average === null ? "팀 평균을 산출할 수 없어 편차를 표시하지 않습니다" : `팀 평균 ${usd(average)} 대비 편차`,
    stats: [
      { key: "사용자", value: numberText(summary?.usage?.activeUsers), sub: "명", tone: "var(--text)" },
      { key: "세션", value: numberText(summary?.usage?.sessionCount), sub: "건", tone: "var(--text)" },
      { key: "총 토큰", value: tokenText(summary?.usage?.tokens.total), sub: "", tone: "var(--text)" },
      { key: "환산 금액", value: moneyText(summary?.usage?.equivalentCostUsd), sub: "", tone: "var(--text)" },
      { key: "캐시 적중 (팀 전체)", value: summary?.cacheHitRatio == null ? "-" : `${(summary.cacheHitRatio * 100).toFixed(0)}%`, sub: "",
        tone: summary?.cacheHitRatio != null && summary.cacheHitRatio < 0.6 ? "var(--orange-ink)" : "var(--text)" },
    ],
    /** 보이는 만큼의 합계와 팀 전체를 같이 적어 "일부만 보고 있음"을 숨기지 않는다. 금액을 모르는 사용자가 있으면 합계를 만들지 않는다. */
    sumNote: (shown: readonly { costValue: number | null }[]) => {
      const known = shown.every((row) => row.costValue !== null);
      const sum = shown.reduce((total, row) => total + (row.costValue ?? 0), 0);
      return [`${shown.length}명 합계 ${known ? usd(sum) : "-"}`, `팀 전체 ${usdText(teamCost)}`, unidentified ? `미식별 ${usd(unidentified)}` : ""].filter(Boolean).join(" · ");
    },
  };
}

function userRow(user: TeamUser, average: number | null, endDate: string | undefined) {
  const cost = numeric(user.usage.equivalentCostUsd);
  const deviation = cost === null || average === null || average === 0 ? null : cost / average - 1;
  const last = user.lastUsedAt === null ? null : Date.parse(user.lastUsedAt);
  const lastDate = user.lastUsedAt === null ? null : new Date(user.lastUsedAt).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  // 기간 끝보다 7일 이상 전이 마지막 사용이면 유휴 단서로 강조한다.
  const idle = lastDate !== null && endDate !== undefined && (Date.parse(endDate) - Date.parse(lastDate)) / 86_400_000 >= 7;
  return {
    key: user.memberId, account: user.account,
    sessionCount: user.usage.sessionCount, tokenValue: user.usage.tokens.total, costValue: cost, cacheValue: user.cache.hitRatio, lastValue: last,
    sessions: numberText(user.usage.sessionCount), tokens: tokenText(user.usage.tokens.total), cost: moneyText(user.usage.equivalentCostUsd),
    cache: user.cache.hitRatio === null ? "-" : `${(user.cache.hitRatio * 100).toFixed(0)}%`,
    // 캐시 적중이 낮으면 같은 작업에 토큰을 두 번 내고 있다는 뜻이다.
    cacheColor: user.cache.hitRatio !== null && user.cache.hitRatio < 0.6 ? "var(--orange-ink)" : "var(--text2)",
    deviationText: deviation === null ? "-" : Math.abs(deviation) < 0.005 ? "" : `${deviation > 0 ? "+" : "−"}${Math.abs(deviation * 100).toFixed(0)}%`,
    deviationColor: deviation === null ? "var(--text3)" : deviation >= 0.25 ? "var(--orange-ink)" : deviation <= -0.25 ? "var(--text3)" : "var(--text2)",
    model: user.mainModel?.displayName ?? "-",
    last: lastDate === null ? "-" : `${Number(lastDate.slice(5, 7))}/${Number(lastDate.slice(8, 10))}`,
    lastColor: idle ? "var(--orange-ink)" : "var(--text2)",
  };
}
export type TeamUserRow = ReturnType<typeof userRow>;
