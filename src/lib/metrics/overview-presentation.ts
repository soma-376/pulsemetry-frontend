import { CONTRACT_STATUS, contractSummaryNotice, type ContractStatus } from "../contract-status";
import type { Overview } from "@/lib/api/overview";
import type { OverviewSettings } from "@/lib/api/overview-vendors";
import { changeText, groupModels, moneyText, numberText, numeric } from "@/lib/api/overview-format";
import { signedUsd } from "@/lib/format";
import { getVendorProduct } from "@/lib/vendor-catalog";
import type { OverviewModel } from "./overview";

export type OverviewChart = Omit<OverviewModel["chart"], "cost" | "series"> & {
  cost: (number | null)[];
  series: { id: string; name: string; color: string; values: (number | null)[] }[];
};
/** 개요의 계약·좌석 표 — 서버 설정(계약·좌석 원장)과 회수 후보 목록, 개요의 제품별 관측에서 만든다. 메모리 좌석 데이터를 쓰지 않는다. */
export type OverviewVendorDisplay = {
  snapshotDate: string;
  rows: {
    id: string; name: string; color: string;
    /** 선택 기간의 사용 관측 인원(좌석 수가 아니다). 모르면 null */
    observedUsers: number | null;
    /** 회수 후보 수 — 서버 회수 후보 목록을 제품별로 센 값. 목록을 읽지 못했으면 null */
    candidates: number | null;
    purchased: number | null; monthly: number | null;
    contractStatus: ContractStatus; status: string; startDate?: string;
    contracts: { id: string; name: string; plan: string; tiers: { label: string; seats: number; fee: number }[]; confirmed: boolean; term?: string }[];
    /** 좌석 원장의 배정 좌석(서버). 원장을 쓸 수 없으면 null 과 사유. */
    assigned?: number | null; seatsReason?: string | null;
  }[];
  /** 회수 후보가 판정하지 못한 좌석을 뺀 목록인가(서버 partial). */
  candidatesPartial?: boolean;
};
type TeamChange = { changeText: string; contrib: number | null; contribText: string };
export type OverviewTeamSummary = {
  show: boolean; hasUnmapped: boolean; moreLabel: string;
  /** 두 기간이 모두 완전해 서버가 이전 값을 준 경우에만 증감·증가 기여 열을 그린다(비교 불가를 0%로 그리지 않는다). */
  comparable: boolean; compareLabel: string;
  rows: ({ teamId?: string; team: string; users: string; userCount: number | null; vendors: string[] | null; cost: number | null; costText: string } & TeamChange)[];
  unmappedUsers: string; unmappedVendors: string[] | null; unattributedCostText: string; unmapped: TeamChange;
};
const colors = ["var(--purple)", "var(--blue)", "var(--orange-ink)", "var(--green)", "var(--gray)"];
const time = (value: string | null) => value ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-";
/** 서버의 `dataThrough`는 확정된 마지막 날의 다음 자정이다. 표시는 그 마지막 날이다. */
const confirmedThrough = (value: string | null) => value ? new Date(Date.parse(value) - 1).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" }) : null;

/** 팀에서 관측된 제품 이름. 매핑 없는 관측은 "미확인 제품"이다(서버 순서 — 카탈로그 순, 미확인은 끝). */
const productNames = (products: Overview["productUsage"]["products"] | Overview["teamUsage"]["unassigned"]["products"]) =>
  products.map((product) => product.kind === null ? "미확인 제품" : product.displayName ?? product.kind);

/** 비교가 나오지 않은 이유 — 서버가 비교를 내지 않은 근거(두 기간의 관측)를 그대로 옮긴다. 개요와 팀 분석이 같이 쓴다. */
export function comparisonReason(data: { meta: { currentCoverage: Overview["meta"]["currentCoverage"] }; comparison: Overview["comparison"] }) {
  if (data.comparison.mode === "none") return "";
  if (data.meta.currentCoverage.status !== "complete") return "선택 기간에 수집 근거가 완전하지 않은 날이 있습니다";
  if (data.comparison.status === "available") return "";
  const { startDate, endDate, coverage } = data.comparison;
  if (coverage && coverage.status !== "complete") return `비교 기간${startDate && endDate ? `(${startDate} ~ ${endDate})` : ""}에 수집 근거가 완전하지 않은 날이 있습니다`;
  return "비교할 수 있는 수집 근거가 없습니다";
}
function teamChange(current: { equivalentCostUsd: string | null }, previous: { equivalentCostUsd: string | null } | null, status: Overview["comparison"]["status"]): TeamChange {
  const now = numeric(current.equivalentCostUsd), before = numeric(previous?.equivalentCostUsd);
  const contrib = status === "available" && now !== null && before !== null ? now - before : null;
  return { changeText: changeText(now, before, status), contrib, contribText: contrib === null ? "-" : signedUsd(contrib) };
}

/** 기존 개요 컴포넌트의 입력으로만 변환한다. 미제공 값을 목 데이터나 0으로 채우지 않는다. */
/**
 * 좌석과 효율(서버 개요의 `seats` — 좌석 원장·관측 매핑 범위) — 기간 좌석료 배분 추정 대비 환산가치. 서버가 내지 않으면 쓰지 않는다(추정하지 않는다).
 */
function seatEfficiency(data: Overview): string | null {
  const current = data.seats.current;
  if (data.seats.availability === "unavailable" || !current) return null;
  const efficiency = current.efficiency === null ? "-" : `${numberText(Math.round(current.efficiency * 1000) / 10)}%`;
  return `기간 좌석료 배분 추정 ${moneyText(current.allocatedFeeUsd)} 대비 환산가치 ${efficiency}${data.seats.availability === "partial" ? " · 일부 제품 제외" : ""}`;
}

export function presentOverview(data: Overview, settings?: OverviewSettings) {
  const current = data.usage.current;
  const previous = data.usage.previous;
  const comparable = data.comparison.status === "available" && data.meta.currentCoverage.status === "complete";
  const noDeltaReason = comparisonReason(data);
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
    { label: "사용 관측 인원", value: numberText(current?.activeUsers), unit: "명", now: current?.activeUsers, before: previous?.activeUsers, previousText: `${numberText(previous?.activeUsers)}명`, def: "선택 기간에 사용 신호가 관측된 고유 구성원 수 · 여러 벤더를 사용해도 한 명으로 계산", caption: "선택 기간 고유 구성원 · 벤더 좌석 수와 별개", good: true, bad: false },
    { label: "토큰 비용", value: moneyText(current?.equivalentCostUsd), unit: ` / ${current?.tokens.total == null ? "-" : `${numberText(current.tokens.total / 1_000_000)}M`}`, now: numeric(current?.equivalentCostUsd), before: numeric(previous?.equivalentCostUsd), previousText: moneyText(previous?.equivalentCostUsd), def: "토큰 × 공시 단가 = 사용 환산액 · 실제 청구액과 별개", caption: `${topName.replace("claude-", "")} 환산가치 ${topShare}`, good: true, bad: false },
    { label: "월 좌석 계약액", value: moneyText(settings?.summary.monthlySeatFeeUsd), unit: "", now: null, before: null, previousText: "", def: "유효한 좌석제 계약의 수량 × 월 단가 합계(USD) · 종량제·추가 사용료 제외 · 실제 청구액과 별개", caption: [settings ? ["유효 계약 기준", contractSummaryNotice(settings.vendors.items)].filter(Boolean).join(" · ") : "유효 계약 기준 · 조회 기간과 별개", seatEfficiency(data)].filter(Boolean).join(" · "), good: false, bad: false },
    { label: "세션", value: numberText(current?.sessionCount), unit: "", now: current?.sessionCount, before: previous?.sessionCount, previousText: numberText(previous?.sessionCount), def: "세션 = 도구 프로세스 1회 실행 · fresh = 이어하기 아님", caption: `사용자당 ${current?.activeUsers && current.sessionCount != null ? numberText(current.sessionCount / current.activeUsers) : "-"}회 · 세션당 ${current?.sessionCount && current.equivalentCostUsd !== null ? moneyText(String(Number(current.equivalentCostUsd) / current.sessionCount)) : "-"}`, good: false, bad: false },
    { label: "보안 경보 및 알림", value: numberText(data.alerts.availability === "unavailable" ? null : data.alerts.unacknowledgedTotal), unit: "건", now: null, before: null, previousText: "", def: "현재 미확인 보안 경보 및 비용 알림", caption: `현재 미확인 · 보안 ${numberText(data.alerts.availability === "unavailable" ? null : data.alerts.security)} · 비용 ${numberText(data.alerts.availability === "unavailable" ? null : data.alerts.cost)}`, good: false, bad: data.alerts.availability !== "unavailable" && (data.alerts.unacknowledgedTotal ?? 0) > 0 },
  ];
  const kpis = definitions.map(({ now, before, previousText, ...item }, index) => {
    const compared = data.comparison.mode !== "none" && index !== 2 && index !== 4;
    // 이전 값은 서버가 두 기간을 모두 완전하다고 판정했을 때만 있다. 완전한 기간에 사용이 없었으면 0이다(null과 다르다).
    const hasValues = comparable && now != null && before != null;
    const delta = hasValues && before > 0 ? (now - before) / before * 100 : null;
    const deltaText = !hasValues ? "-" : delta !== null ? `${Math.abs(delta).toFixed(1)}%` : now === 0 ? "변화 없음" : "신규";
    return { ...item, delta: deltaText, up: (delta ?? 0) >= 0, showArrow: delta !== null, showDelta: compared && hasValues, noDelta: compared && !hasValues,
      noDeltaReason: comparable ? "값을 확정할 수 없는 사용이 있어 비교하지 않습니다" : noDeltaReason, previousText: compared && hasValues ? previousText : undefined };
  });
  const cost = data.trend.points.map((point) => point.observation === "unobserved" ? null : numeric(point.equivalentCostUsd));
  const yMax = Math.max(1, ...cost.filter((value): value is number => value !== null)) * 1.15;
  const ticks = data.trend.points.map((point) => ({ label: `${Number(point.date.slice(5, 7))}.${Number(point.date.slice(8))}`, date: point.date, preObserved: point.observation === "unobserved", tokens: numberText(point.totalTokens), cost: moneyText(point.observation === "unobserved" ? null : point.equivalentCostUsd) }));
  const chart: OverviewChart = { cost, yMax, topLabel: moneyText(String(yMax)), midLabel: moneyText(String(yMax / 2)), labels: ticks.map((tick) => tick.label), ticks,
    // 개요 API는 벤더별 일별 추이를 제공하지 않으므로 실제 조직 전체 계열만 전달한다.
    series: [{ id: "organization", name: "전체", color: "var(--purple)", values: cost }],
  };
  // 등록 제품의 사용 관측 인원 — 서버가 관측 제품을 명시 매핑으로 이은 선택 기간의 값이다(좌석 수가 아니다).
  // 목록에 없는 등록 제품은 이 기간에 관측된 사용이 없다는 뜻이다(0). 사용량 자체를 모르면(null) 추정하지 않는다.
  const productUsers = (kind: string) => {
    if (!current) return null;
    const product = data.productUsage.products.find((item) => item.kind === kind);
    return product ? product.activeUsers : 0;
  };
  const vendorOverview: OverviewVendorDisplay = {
    snapshotDate: settings?.meta.asOf.slice(0, 10) ?? data.meta.endDate,
    candidatesPartial: settings?.candidates?.availability === "partial",
    rows: settings?.vendors.items.map((vendor) => ({
      id: vendor.vendorId, name: vendor.displayName, color: getVendorProduct(vendor.kind)?.color ?? "var(--text3)",
      observedUsers: productUsers(vendor.kind),
      // 회수 후보는 서버 회수 후보 목록을 제품별로 센 값이다. 목록을 읽지 못했으면 모른다(null).
      candidates: settings.candidates ? settings.candidates.byVendor[vendor.vendorId] ?? 0 : null,
      assigned: vendor.seats?.data?.assigned ?? null, seatsReason: vendor.seats?.data ? null : vendor.seats?.reason ?? null,
      purchased: vendor.contract ? vendor.contract.tiers.reduce((sum, tier) => sum + tier.seats, 0) : null,
      monthly: numeric(vendor.contract?.monthlySeatFeeUsd),
      status: CONTRACT_STATUS[vendor.contractStatus].label, contractStatus: vendor.contractStatus, startDate: vendor.contract?.effectiveFrom,
      contracts: vendor.contract ? [{ id: vendor.vendorId, name: vendor.displayName, plan: getVendorProduct(vendor.kind)?.plans.find((plan) => plan.v === vendor.contract!.planId)?.label ?? settings.catalog.plans.find((plan) => plan.kind === vendor.kind && plan.planId === vendor.contract!.planId)?.displayName ?? vendor.contract.planId,
        tiers: vendor.contract.tiers.map((tier) => ({ label: tier.label, seats: tier.seats, fee: Number(tier.monthlyFeePerSeatUsd) })), confirmed: vendor.contractStatus === "active", term: vendor.contract.effectiveTo ?? undefined }] : [],
    })) ?? [],
  };
  const teams = data.teamUsage;
  const unmapped = teams.unassigned.current;
  const hasUnmapped = teams.availability !== "unavailable" && ((unmapped.activeUsers ?? 0) > 0 || Number(unmapped.equivalentCostUsd ?? 0) > 0);
  const attribution: OverviewTeamSummary = { show: teams.totalTeamCount > 1 || hasUnmapped, hasUnmapped, moreLabel: `전체 ${teams.totalTeamCount}팀`,
    comparable: comparable && teams.availability !== "unavailable", compareLabel,
    rows: teams.topTeams.map((team) => ({ teamId: team.teamId, team: team.teamName, users: numberText(team.current.activeUsers), userCount: team.current.activeUsers, vendors: productNames(team.products), cost: numeric(team.current.equivalentCostUsd), costText: moneyText(team.current.equivalentCostUsd),
      ...teamChange(team.current, team.previous, data.comparison.status) })),
    unmappedUsers: numberText(unmapped.activeUsers), unmappedVendors: productNames(teams.unassigned.products), unattributedCostText: moneyText(unmapped.equivalentCostUsd),
    unmapped: teamChange(unmapped, teams.unassigned.previous, data.comparison.status),
  };
  const ingestText = { healthy: "수집 정상", delayed: "수집 지연", down: "수집 중단", empty: "수집 이력 없음", unknown: "확인 불가" }[data.ingest.status];
  const ingestColor = data.ingest.status === "healthy" ? "var(--green)" : data.ingest.status === "down" ? "var(--red)" : "var(--text3)";
  return {
    kpis, chart, mix, vendorOverview, attribution,
    observedTokens: numberText(current?.tokens.total), compareLabel, noDeltaReason: noDeltaReason || "선택·비교 기간의 관측 데이터 부족",
    periodLabel: `${data.meta.startDate} ~ ${data.meta.endDate}`,
    isEmpty: data.meta.dataState === "never_observed", hasData: ["ready", "partial"].includes(data.meta.dataState),
    observation: { firstObservedIndex: Math.max(0, cost.findIndex((value) => value !== null)), hasGap: data.meta.currentCoverage.status !== "complete", chartNote: "데이터가 없는 날짜는 차트에서 제외됩니다. 전체 기간 비교는 보류합니다.", coverageNote: data.meta.currentCoverage.status === "complete" ? "" : [`선택 ${data.meta.dayCount}일 중 ${data.meta.currentCoverage.observedDays}일 관측`,
      confirmedThrough(data.meta.dataThrough) && `${confirmedThrough(data.meta.dataThrough)}까지 확정`].filter(Boolean).join(" · ") },
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
