import { dayCount, shortDate, type DateRange } from "@/lib/date";
import { aggregateActivity, comparisonRange } from "./activity";
import { SAMPLE_END } from "@/mocks/activity";
import { int, pct, signedUsd, usd } from "@/lib/format";
import { contributionColor, costDeltaColor } from "@/lib/metrics/deltas";
import {
  ingestBadge,
  ingestDownCopy,
} from "@/lib/metrics/observation";
import { seatEconomics, seatVerdict } from "@/lib/metrics/seat-economics";
import {
  COVERAGE,
  INGEST,
  INSTALL_CMD,
  MODEL_COLORS,
  MODEL_META,
  ORG as BASE_ORG,
  WASTE,
} from "@/mocks/overview";
import { SEAT_TIERS, STD_SEAT_FEE } from "@/mocks/vendors";
import type { CompareKey } from "@/types/domain";

/** 도넛에 색을 줄 상위 모델 수. 넘어가면 읽을 수 없어 "기타"로 묶습니다 */
const MIX_TOP_N = 4;

export type OverviewModel = ReturnType<typeof buildOverview>;

export function buildOverview(compare: CompareKey = "prev_week", dates: DateRange = { start: "2026-09-07", end: SAMPLE_END }) {
  const current = aggregateActivity(dates);
  const previous = aggregateActivity(comparisonRange(dates, compare));
  const RANGE_DAYS = dayCount(dates);
  const growth = (now: number, prev: number) => prev > 0 ? now / prev - 1 : 0;
  const ORG = {
    ...BASE_ORG,
    activeUsers: current.users,
    prevUsers: previous.users,
    sessions: current.sessions,
    sessionsDelta: pct(growth(current.sessions, previous.sessions)),
    costGrowth: growth(current.cost, previous.cost),
    unmappedUsers: current.teams.find((team) => team.team === "미배정")!.users,
  };
  /* ── 조직 총계 ───────────────────────────────────────── */
  const equivValue = current.cost;
  const prevEquivValue = previous.cost;
  const orgIncrease = equivValue - prevEquivValue;

  const userGrowth = growth(ORG.activeUsers, ORG.prevUsers);
  // 팀 미배분 비용은 상수 비율이 아니라 실제 집계에서 가져옵니다 —
  // 귀속 실패는 기간마다 달라지는 사실이지 고정값이 아닙니다.
  const unattributedCost = current.teams.find((team) => team.team === "미배정")!.cost;

  const tokensM = current.tokensM;

  /* ── 적재 · 관측 상태 ─────────────────────────────────── */
  const ingest = ingestBadge(INGEST);
  const isEmpty = ingest.status === "empty";
  const isDown = ingest.status === "down";
  const cmp = {
    showCompare: compare !== "none",
    canCompare: current.complete && previous.complete && previous.cost > 0,
    label: compare === "none" ? "" : compare === "prev_week" ? "전주 대비" : "이전 기간 대비",
    reason: isDown ? "수집 중단" : "선택·비교 기간의 관측 데이터 부족",
  };
  const obs = {
    firstObservedIndex: 0,
    hasGap: current.days.length > 0 && !current.complete,
    rangeLabel: `${dates.start} ~ ${dates.end ?? dates.start}`,
    chartNote: "데이터가 없는 날짜는 차트에서 제외됩니다. 전체 기간 비교와 좌석 효율 판정은 보류합니다.",
    coverageNote: `선택 ${RANGE_DAYS}일 중 ${current.days.length}일 관측`,
  };
  const hasGap = obs.hasGap && !isEmpty;

  /* ── 좌석 경제성 ─────────────────────────────────────── */
  const seat = seatEconomics({
    tiers: SEAT_TIERS,
    activeUsers: ORG.activeUsers,
    equivValue,
    prevEquivValue: prevEquivValue || equivValue || 1,
    rangeDays: RANGE_DAYS,
    stdFee: STD_SEAT_FEE,
  });
  const complete = current.complete && !isDown;
  const verdict = complete ? seatVerdict(seat, equivValue) : {
    title: "관측 범위가 부족해 좌석 효율을 판정할 수 없습니다",
    detail: `선택 ${RANGE_DAYS}일 중 ${current.days.length}일 관측 · 관측된 날짜만 표시합니다`,
    color: "var(--text2)", bg: "var(--sub)", border: "var(--border)",
  };

  /* ── 모델 구성 (W1.4) — 팀별 비용 × 팀별 모델 비중의 합 ── */
  const mixRaw = MODEL_META.map((m) => ({
    ...m,
    share: current.teams.reduce((sum, team) => sum + (team.models[m.v] ?? 0), 0) / (equivValue || 1) * 100,
  })).sort((a, b) => b.share - a.share);

  const mixTotal = mixRaw.reduce((n, m) => n + m.share, 0) || 1;
  const mixTop = mixRaw.slice(0, MIX_TOP_N);
  const mixRest = mixRaw.slice(MIX_TOP_N);
  const restShare = mixRest.reduce((n, m) => n + m.share, 0);

  const mixSlices = mixTop
    .map((m) => ({
      v: m.v,
      name: m.name,
      share: m.share,
      color: MODEL_COLORS[m.v] ?? "var(--gray)",
      sub: `${usd(m.perM)}/M`,
    }))
    .concat(
      restShare > 0
        ? [
            {
              v: "__rest",
              name: `기타 ${mixRest.length}개 모델`,
              share: restShare,
              color: "var(--gray)",
              sub:
                mixRest
                  .map((x) => x.name.replace("claude-", ""))
                  .slice(0, 3)
                  .join(" · ") +
                (mixRest.length > 3 ? ` 외 ${mixRest.length - 3}개` : ""),
            },
          ]
        : [],
    );

  const mixRows = mixSlices.map((m) => {
    const shareText = ((m.share / mixTotal) * 100).toFixed(1) + "%";
    return {
      name: m.name,
      shareText,
      perMText: m.sub,
      color: m.color,
      tip:
        `${m.name} · 환산가치 비중 ${shareText}` +
        (m.v === "__rest" ? ` · ${m.sub}` : ` · 백만 토큰당 ${m.sub}`),
    };
  });

  const mixTopName = mixRaw[0].name;
  const mixTopShare = ((mixRaw[0].share / mixTotal) * 100).toFixed(1) + "%";

  /* ── KPI ─────────────────────────────────────────────── */
  const showDelta = cmp.showCompare && cmp.canCompare && !isDown;
  const noDelta = cmp.showCompare && (!cmp.canCompare || isDown);

  const kpis = [
    {
      label: "활성 좌석",
      value: int(ORG.activeUsers),
      unit: ` / ${seat.seats}석`,
      def: "기간 내 활성시간 > 0인 고유 사용자 수 ÷ 계약 좌석 수",
      caption: complete ? `유휴 ${seat.idleSeats}석 · 회수 시 월 ${usd(seat.idleWasteMonthly)} 절감` : "관측된 날짜의 활성 사용자 · 유휴 판정 보류",
      delta: pct(userGrowth),
      up: userGrowth >= 0,
      good: true,
      bad: false,
    },
    {
      label: "토큰 비용",
      value: usd(equivValue),
      unit: ` / ${int(Math.round(tokensM))}M`,
      def: "토큰 × 벤더 공시 단가 = 환산가치 · 이 사용량을 종량제로 샀다면 낼 금액(청구액은 좌석료) · 토큰은 입력·출력·캐시 합 실측값",
      caption: `${mixTopName.replace("claude-", "")} 환산가치 ${mixTopShare}`,
      delta: pct(ORG.costGrowth),
      up: ORG.costGrowth >= 0,
      good: true,
      bad: false,
    },
    {
      label: "좌석 효율",
      value: complete ? seat.seatEffText : "—",
      unit: "×",
      def: `환산가치 ÷ 지출 · 지출 = 좌석 ${seat.seats}석 ${usd(seat.seatSpendMonthly)}/월 × ${RANGE_DAYS}/30일 = ${usd(seat.spend)} · 1.00× = 종량제와 본전, 그 아래면 좌석이 값을 못 하는 것`,
      caption: complete ? `유휴 ${seat.idleSeats}석 회수 시 ${seat.seatEffIfReclaimed.toFixed(2)}×로 상승` : "전체 기간 관측 후 계산 가능",
      delta: pct(seat.effGrowth),
      up: seat.effGrowth >= 0,
      good: true,
      bad: false,
    },
    {
      label: "세션",
      value: int(ORG.sessions),
      unit: "",
      def: "세션 = 도구 프로세스 1회 실행 · fresh = 이어하기 아님",
      caption: `사용자당 ${(ORG.sessions / (ORG.activeUsers || 1)).toFixed(0)}회 · 세션당 ${usd(equivValue / (ORG.sessions || 1))}`,
      delta: ORG.sessionsDelta,
      up: current.sessions >= previous.sessions,
      good: false,
      bad: false,
    },
    {
      label: "보안 경보 및 알림",
      value: int(ORG.alerts),
      unit: "건",
      def: "미확인 알림 · 보안: 비허용 모델 사용, 권한 자동승인 급증, 미승인 도구 연결 · 비용: 팀 비용 +40% 이상, 좌석 한도 차단 발생, 팀 미배분 비용 10% 초과",
      caption: "현재 미확인 · 보안 2 · 비용 3",
      delta: ORG.alertsDelta,
      up: true,
      good: false,
      bad: true,
    },
  ].map((k, index) => ({ ...k, showDelta: index !== 4 && showDelta, noDelta: index !== 4 && noDelta }));

  /* ── W1.2 일별 시계열 ─────────────────────────────────── */
  const dailySpend = seat.seatSpendMonthly / 30;
  const weekCost = current.days.map((day) => day.teams.reduce((sum, team) => sum + team.cost, 0));
  const weekSpend = weekCost.map(() => dailySpend);
  const yMax = Math.max(...weekCost, dailySpend) * 1.15;
  const weekTicks = current.days.map((day, i) => ({
    label: shortDate(day.date), date: day.date, preObserved: false,
    tokens: `${day.teams.reduce((sum, team) => sum + team.tokensM, 0).toFixed(1)}M`,
    cost: usd(weekCost[i]), spend: usd(dailySpend),
    effText: (weekCost[i] / dailySpend).toFixed(2) + "×",
    gap: signedUsd(weekCost[i] - dailySpend),
    gapColor: weekCost[i] >= dailySpend ? "var(--green)" : "var(--red)",
  }));

  /* ── W1.6 사용 낭비 ───────────────────────────────────── */
  const wasteScale = equivValue / Math.max(current.days.length, 1) / 600;
  const previousWasteScale = prevEquivValue / Math.max(previous.days.length, 1) / 600;
  const wasteMax = Math.max(...WASTE.map((w) => w.cost));
  const wasteRows = [...WASTE]
    .sort((a, b) => b.cost - a.cost)
    .map((w) => {
      const d = growth(wasteScale, previousWasteScale);
      return {
        title: w.title,
        rate: w.rate.toFixed(1) + "%",
        cost: usd(w.cost * wasteScale),
        barWidth: ((w.cost / wasteMax) * 100).toFixed(1) + "%",
        prevWidth: showDelta ? Math.min(100, w.cost * previousWasteScale / (wasteMax * (wasteScale || 1)) * 100).toFixed(1) + "%" : undefined,
        delta: showDelta ? (d >= 0 ? "▲ " : "▼ ") + pct(Math.abs(d)).replace("+", "") : "—",
        deltaColor: costDeltaColor(d),
      };
    });

  const wasteSum = WASTE.reduce((n, w) => n + w.cost, 0) * wasteScale;
  // 항목끼리 겹칠 수 있어 비율은 합산하지 않습니다 — 총액만 월 환산해서 비교합니다
  const wasteTotalNote = "선택 기간 사용량의 월 환산";

  /* ── W1.7 팀별 사용량 ─────────────────────────────────── */
  const teams = current.teams.filter((team) => team.team !== "미배정").map((team) => {
    const prev = previous.teams.find((item) => item.team === team.team)!;
    return { ...team, contrib: team.cost - prev.cost, perUserPct: growth(team.cost / (team.users || 1), prev.cost / (prev.users || 1)) };
  });
  const contribMax = Math.max(...teams.map((team) => Math.abs(team.contrib)), 1);
  const attrRows = teams.map((t) => {
    const models = MODEL_META.map((m) => ({ name: m.name, share: (t.models[m.v] ?? 0) / (t.cost || 1) * 100, color: MODEL_COLORS[m.v] ?? "var(--gray)" })).sort((a, b) => b.share - a.share);
    return {
      team: t.team, users: int(t.users),
      userCount: t.users, cost: t.cost,
      perUser: t.cost / (t.users || 1), contrib: t.contrib,
      cause: `${models[0].name.replace("claude-", "")} 비중 ${models[0].share.toFixed(0)}%`,
      costText: usd(t.cost),
      perUserText: usd(t.cost / (t.users || 1)),
      perUserDelta: showDelta ? pct(t.perUserPct) : "—",
      perUserColor: costDeltaColor(t.perUserPct),
      contribText: showDelta ? signedUsd(t.contrib) : "—",
      contribColor: contributionColor(t.contrib, orgIncrease),
      barColor: t.contrib >= 0 ? "var(--red)" : "var(--green)",
      barWidth: showDelta ? (Math.abs(t.contrib) / contribMax * 100).toFixed(1) + "%" : "0%",
      sessions: int(t.sessions),
      tokens: `${t.tokensM.toFixed(1)}M`,
      models,
    };
  }).sort((a, b) => b.cost - a.cost);
  const unmapped = current.teams.find((team) => team.team === "미배정")!;
  const unattrContrib = unmapped.cost - previous.teams.find((team) => team.team === "미배정")!.cost;

  return {
    periodLabel: `${dates.start} ~ ${dates.end ?? dates.start}`,
    showDelta,
    rangeDays: RANGE_DAYS,
    compare,
    compareLabel: cmp.label,
    noDeltaReason: cmp.reason,
    isEmpty,
    hasData: !isEmpty && current.days.length > 0,
    installCmd: INSTALL_CMD,
    setupSteps: [
      {
        n: "1",
        title: "데몬 설치",
        note: "MDM으로 배포하거나 개발자가 직접 실행합니다",
        state: "대기 중",
        stateFg: "var(--orange-ink)",
        badgeBg: "var(--text)",
        badgeFg: "var(--card)",
      },
      {
        n: "2",
        title: "계약 정보 입력",
        note: "플랜·좌석 단가·좌석 수 · 신호와 무관하게 지금 입력할 수 있습니다",
        state: "지금 가능",
        stateFg: "var(--blue)",
        badgeBg: "var(--sub)",
        badgeFg: "var(--text2)",
      },
      {
        n: "3",
        title: "팀 매핑",
        note: "첫 신호가 들어오면 사용자가 나타납니다 · 그때 팀을 배정합니다",
        state: "신호 이후",
        stateFg: "var(--text3)",
        badgeBg: "var(--sub)",
        badgeFg: "var(--text3)",
      },
    ],

    ingest: {
      ...ingest,
      isDown: isDown && !isEmpty,
      lastIngestAt: INGEST.lastIngestAt,
      down: ingestDownCopy(INGEST),
      liveInstalls: isEmpty || isDown ? "0" : int(COVERAGE.activeInstalls),
      liveMembers: int(COVERAGE.activeMembers),
      liveCoverage: isEmpty || isDown ? "0%" : COVERAGE.coverageText,
    },

    observation: { ...obs, hasGap, coverageNote: hasGap ? obs.coverageNote : "" },

    kpis,
    seat,
    verdict,

    chart: {
      labels: weekTicks.map((tick) => tick.label),
      cost: weekCost,
      spend: weekSpend,
      yMax,
      spendLabel: `${usd(dailySpend)} / 일`,
      topLabel: usd(yMax),
      midLabel: usd(yMax / 2),
      ticks: weekTicks,
    },

    mix: {
      slices: mixSlices,
      rows: mixRows,
      topName: mixTopName,
      topShare: mixTopShare,
      headline: `${mixTopName}이 환산가치의 ${mixTopShare}를 차지`,
      detail: "선택 기간의 환산가치 · 모델을 선택하면 비중을 확인할 수 있어요",
    },

    waste: {
      rows: wasteRows,
      total: usd(wasteSum),
      totalNote: wasteTotalNote,
      def: "캐시로 대체 가능했던 토큰, 재시도·중단된 호출, 응답 대비 과대한 입력을 공시 단가로 환산한 값입니다. 벤더 청구서에는 구분되어 나타나지 않습니다.",
    },

    attribution: {
      rows: attrRows,
      moreLabel: `전체 ${teams.length}팀`,
      unmappedUsers: int(ORG.unmappedUsers),
      unattributedCostText: usd(unattributedCost),
      unmappedPerUserText: usd(unattributedCost / (ORG.unmappedUsers || 1)),
      unattrText: showDelta ? signedUsd(unattrContrib) : "—",
      unattrWidth: showDelta ? Math.min(100, Math.abs(unattrContrib) / contribMax * 100).toFixed(1) + "%" : "0%",
    },

    defs: {
      w12: "날짜별 환산가치와 계약 좌석료의 일할 금액을 비교합니다 · 관측된 날짜만 표시합니다",
      w14: "모델 구성: 모델별 환산가치 ÷ 전체 환산가치 · 좌석료가 아니라 사용량의 구성을 봅니다",
      w17: "팀별 환산가치 = 팀 귀속 토큰 × 공시 단가 · 증가 기여는 전사 증가분을 팀별 금액으로 분해한 값",
    },
  };
}
