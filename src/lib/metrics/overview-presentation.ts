import type { Overview } from "@/lib/api/overview";
import type { OverviewSettings } from "@/lib/api/overview-vendors";
import { groupModels, moneyText, numberText, numeric } from "@/lib/api/overview-format";
import { getVendorProduct } from "@/lib/vendor-catalog";
import type { OverviewModel } from "./overview";
import type { OverviewVendorsModel } from "./overview-vendors";

export type OverviewChart = Omit<OverviewModel["chart"], "cost" | "series"> & {
  cost: (number | null)[];
  series: { id: string; name: string; color: string; values: (number | null)[] }[];
};
export type OverviewVendorDisplay = Omit<OverviewVendorsModel, "rows"> & {
  rows: (Omit<OverviewVendorsModel["rows"][number], "observedUsers"> & { observedUsers: number | null })[];
};
export type OverviewTeamSummary = {
  show: boolean; hasUnmapped: boolean; moreLabel: string;
  rows: { teamId?: string; team: string; users: string; userCount: number | null; vendors: string[] | null; cost: number | null; costText: string }[];
  unmappedUsers: string; unmappedVendors: string[] | null; unattributedCostText: string;
};
const colors = ["var(--purple)", "var(--blue)", "var(--orange-ink)", "var(--green)", "var(--gray)"];
const time = (value: string | null) => value ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-";

/** 기존 개요 컴포넌트의 입력으로만 변환한다. 미제공 값을 목 데이터나 0으로 채우지 않는다. */
export function presentOverview(data: Overview, settings?: OverviewSettings) {
  const current = data.usage.current;
  const previous = data.usage.previous;
  const comparable = data.comparison.status === "available" && data.meta.currentCoverage.status === "complete";
  const compareLabel = data.comparison.mode === "none" ? "" : data.comparison.mode === "prev_week" ? "전주 대비" : "이전 기간 대비";
  const models = data.modelMix.availability === "unavailable" ? [] : groupModels(data.modelMix.models);
  const fullModelCosts = data.modelMix.availability === "available" && models.every((model) => model.equivalentCostUsd !== null);
  const totalModelCost = fullModelCosts ? models.reduce((sum, model) => sum + Number(model.equivalentCostUsd), 0) : 0;
  const shares = models.map((model) => totalModelCost > 0 ? Number(model.equivalentCostUsd) / totalModelCost * 100 : null);
  const topName = models[0]?.displayName ?? "관측 없음";
  const topShare = shares[0] == null ? "-" : `${shares[0].toFixed(1)}%`;
  const mix: OverviewModel["mix"] = {
    count: data.modelMix.availability === "unavailable" ? 0 : data.modelMix.models.length,
    slices: totalModelCost > 0 ? models.map((model, i) => ({ v: model.modelId, name: model.displayName, cost: Number(model.equivalentCostUsd), color: colors[i % colors.length], sub: moneyText(model.effectiveCostPerMillionTokensUsd), share: shares[i]! })) : [],
    rows: models.map((model, i) => ({ name: model.displayName, color: colors[i % colors.length], shareText: shares[i] === null ? "-" : `${shares[i]!.toFixed(1)}%`, perMText: model.effectiveCostPerMillionTokensUsd === null ? "-" : `${moneyText(model.effectiveCostPerMillionTokensUsd)}/M`, costText: moneyText(model.equivalentCostUsd), tip: `${model.displayName} · 환산가치 ${moneyText(model.equivalentCostUsd)} · 토큰 ${numberText(model.totalTokens)}` })),
    topName, topShare,
    headline: totalModelCost > 0 ? `${topName}이 환산가치의 ${topShare}를 차지` : models.length ? "환산가치 비중 확인 불가" : "관측된 모델이 없습니다",
    detail: "선택 기간의 환산가치 · 모델을 선택하면 비중을 확인할 수 있어요",
  };
  const definitions = [
    { label: "사용 관측 인원", value: numberText(current?.activeUsers), unit: "명", now: current?.activeUsers, before: previous?.activeUsers, def: "선택 기간에 사용 신호가 관측된 고유 구성원 수 · 여러 벤더를 사용해도 한 명으로 계산", caption: "선택 기간 고유 구성원 · 벤더 좌석 수와 별개", good: true, bad: false },
    { label: "토큰 비용", value: moneyText(current?.equivalentCostUsd), unit: ` / ${current?.tokens.total == null ? "-" : `${numberText(current.tokens.total / 1_000_000)}M`}`, now: numeric(current?.equivalentCostUsd), before: numeric(previous?.equivalentCostUsd), def: "토큰 × 공시 단가 = 사용 환산액 · 실제 청구액과 별개", caption: `${topName.replace("claude-", "")} 환산가치 ${topShare}`, good: true, bad: false },
    { label: "월 좌석 계약액", value: moneyText(settings?.summary.monthlySeatFeeUsd), unit: "", now: null, before: null, def: "현재 확인된 좌석제 계약의 수량 × 월 단가 합계(USD) · 종량제·추가 사용료 제외 · 실제 청구액과 별개", caption: "현재 확인된 계약 기준 · 조회 기간과 별개", good: false, bad: false },
    { label: "세션", value: numberText(current?.sessionCount), unit: "", now: current?.sessionCount, before: previous?.sessionCount, def: "세션 = 도구 프로세스 1회 실행 · fresh = 이어하기 아님", caption: `사용자당 ${current?.activeUsers && current.sessionCount != null ? numberText(current.sessionCount / current.activeUsers) : "-"}회 · 세션당 ${current?.sessionCount && current.equivalentCostUsd !== null ? moneyText(String(Number(current.equivalentCostUsd) / current.sessionCount)) : "-"}`, good: false, bad: false },
    { label: "보안 경보 및 알림", value: numberText(data.alerts.availability === "unavailable" ? null : data.alerts.unacknowledgedTotal), unit: "건", now: null, before: null, def: "현재 미확인 보안 경보 및 비용 알림", caption: `현재 미확인 · 보안 ${numberText(data.alerts.availability === "unavailable" ? null : data.alerts.security)} · 비용 ${numberText(data.alerts.availability === "unavailable" ? null : data.alerts.cost)}`, good: false, bad: data.alerts.availability !== "unavailable" && (data.alerts.unacknowledgedTotal ?? 0) > 0 },
  ];
  const kpis = definitions.map(({ now, before, ...item }, index) => {
    const hasDelta = comparable && now != null && before != null && before > 0;
    const delta = hasDelta ? (now - before) / before * 100 : null;
    return { ...item, delta: delta === null ? "-" : `${Math.abs(delta).toFixed(1)}%`, up: (delta ?? 0) >= 0, showDelta: hasDelta && index !== 2 && index !== 4, noDelta: data.comparison.mode !== "none" && !hasDelta && index !== 2 && index !== 4 };
  });
  const cost = data.trend.points.map((point) => point.observation === "unobserved" ? null : numeric(point.equivalentCostUsd));
  const yMax = Math.max(1, ...cost.filter((value): value is number => value !== null)) * 1.15;
  const ticks = data.trend.points.map((point) => ({ label: `${Number(point.date.slice(5, 7))}.${Number(point.date.slice(8))}`, date: point.date, preObserved: point.observation === "unobserved", tokens: numberText(point.totalTokens), cost: moneyText(point.observation === "unobserved" ? null : point.equivalentCostUsd) }));
  const chart: OverviewChart = { cost, yMax, topLabel: moneyText(String(yMax)), midLabel: moneyText(String(yMax / 2)), labels: ticks.map((tick) => tick.label), ticks,
    // 개요 API는 벤더별 일별 추이를 제공하지 않으므로 실제 조직 전체 계열만 전달한다.
    series: [{ id: "organization", name: "전체", color: "var(--purple)", values: cost }],
  };
  const vendorOverview: OverviewVendorDisplay = {
    snapshotDate: settings?.meta.asOf.slice(0, 10) ?? data.meta.endDate,
    rows: settings?.vendors.items.map((vendor) => ({
      id: vendor.vendorId, name: vendor.displayName, color: getVendorProduct(vendor.kind)?.color ?? "var(--text3)",
      observedUsers: null, candidates: null,
      purchased: vendor.contract ? vendor.contract.tiers.reduce((sum, tier) => sum + tier.seats, 0) : null,
      monthly: numeric(vendor.contract?.monthlySeatFeeUsd),
      status: vendor.contract ? "등록됨" : vendor.state === "configured" ? "확인 대기" : "미등록",
      contracts: vendor.contract ? [{ id: vendor.vendorId, name: vendor.displayName, plan: getVendorProduct(vendor.kind)?.plans.find((plan) => plan.v === vendor.contract!.planId)?.label ?? settings.catalog.plans.find((plan) => plan.kind === vendor.kind && plan.planId === vendor.contract!.planId)?.displayName ?? vendor.contract.planId,
        tiers: vendor.contract.tiers.map((tier) => ({ label: tier.label, seats: tier.seats, fee: Number(tier.monthlyFeePerSeatUsd) })), confirmed: true, term: vendor.contract.effectiveTo ?? undefined }] : [],
    })) ?? [],
  };
  const teams = data.teamUsage;
  const unmapped = teams.unassigned.current;
  const hasUnmapped = teams.availability !== "unavailable" && ((unmapped.activeUsers ?? 0) > 0 || Number(unmapped.equivalentCostUsd ?? 0) > 0);
  const attribution: OverviewTeamSummary = { show: teams.totalTeamCount > 1 || hasUnmapped, hasUnmapped, moreLabel: `전체 ${teams.totalTeamCount}팀`,
    rows: teams.topTeams.map((team) => ({ teamId: team.teamId, team: team.teamName, users: numberText(team.current.activeUsers), userCount: team.current.activeUsers, vendors: null, cost: numeric(team.current.equivalentCostUsd), costText: moneyText(team.current.equivalentCostUsd) })),
    unmappedUsers: numberText(unmapped.activeUsers), unmappedVendors: null, unattributedCostText: moneyText(unmapped.equivalentCostUsd),
  };
  const ingestText = { healthy: "수집 정상", delayed: "수집 지연", down: "수집 중단", empty: "수집 이력 없음", unknown: "확인 불가" }[data.ingest.status];
  const ingestColor = data.ingest.status === "healthy" ? "var(--green)" : data.ingest.status === "down" ? "var(--red)" : "var(--text3)";
  return {
    kpis, chart, mix, vendorOverview, attribution,
    observedTokens: numberText(current?.tokens.total), compareLabel, noDeltaReason: "선택·비교 기간의 관측 데이터 부족",
    periodLabel: `${data.meta.startDate} ~ ${data.meta.endDate}`,
    isEmpty: data.meta.dataState === "never_observed", hasData: ["ready", "partial"].includes(data.meta.dataState),
    observation: { firstObservedIndex: Math.max(0, cost.findIndex((value) => value !== null)), hasGap: data.meta.currentCoverage.status !== "complete", chartNote: "데이터가 없는 날짜는 차트에서 제외됩니다. 전체 기간 비교는 보류합니다.", coverageNote: data.meta.currentCoverage.status === "complete" ? "" : `선택 ${data.meta.dayCount}일 중 ${data.meta.currentCoverage.observedDays}일 관측` },
    ingest: { isDown: data.ingest.status === "down", dot: ingestColor, fg: ingestColor, text: ingestText, liveInstalls: numberText(data.ingest.activeInstallations), liveMembers: numberText(data.ingest.observedMembers), liveCoverage: data.ingest.coverageRatio === null ? "-" : `${numberText(data.ingest.coverageRatio * 100)}%`, lastIngestAt: time(data.ingest.lastReceivedAt), down: { title: "수집이 중단되었습니다", detail: `마지막 수신 ${time(data.ingest.lastReceivedAt)}` } },
    installCmd: "",
    setupSteps: [
      { n: "1", title: "데몬 설치", note: "MDM으로 배포하거나 개발자가 직접 실행합니다", state: "대기 중", stateFg: "var(--orange-ink)", badgeBg: "var(--text)", badgeFg: "var(--card)" },
      { n: "2", title: "계약 정보 입력", note: "플랜·좌석 단가·좌석 수 · 신호와 무관하게 지금 입력할 수 있습니다", state: "지금 가능", stateFg: "var(--blue)", badgeBg: "var(--sub)", badgeFg: "var(--text2)" },
      { n: "3", title: "팀 매핑", note: "첫 신호가 들어오면 사용자가 나타납니다 · 그때 팀을 배정합니다", state: "신호 이후", stateFg: "var(--text3)", badgeBg: "var(--sub)", badgeFg: "var(--text3)" },
    ],
    defs: { w12: "날짜별 토큰 사용량의 공시 단가 환산액 · 실제 청구액과 별개 · 관측된 날짜만 표시합니다", w14: "모델 구성: 모델별 환산가치 ÷ 전체 환산가치 · 좌석료가 아니라 사용량의 구성을 봅니다", w17: "이벤트 당시 팀별 사용 환산액" },
  };
}
