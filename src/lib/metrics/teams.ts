import { type DateRange } from "@/lib/date";
import { int, pct, signedUsd, usd } from "@/lib/format";
import { aggregateActivity, comparisonRange } from "./activity";
import { SAMPLE_END } from "@/mocks/activity";
import { MODEL_COLORS, MODEL_META } from "@/mocks/overview";
import { buildRoster, rosterOffsets } from "./roster";
import type { CompareKey } from "@/types/domain";
import { SEED_TEAMS, teamLabel, type Team } from "@/lib/organization";

/**
 * P2 팀 분석.
 *
 * 개요(P1)와 같은 aggregateActivity 를 원천으로 씁니다 — 두 페이지가 다른 수치를
 * 보여주면 어느 쪽도 믿을 수 없게 됩니다.
 *
 * 축이 셋인 이유: 비용만 보면 "인원이 많은 팀"이 항상 1등이라 아무것도 알 수 없습니다.
 * 토큰은 사용량, 세션은 사용 패턴을 분리해 보여주고, 사용자당 열이 그 셋을 인원수로 나눕니다.
 */

export type AxisKey = "cost" | "token" | "session";

export type TeamsModel = ReturnType<typeof buildTeams>;

/** 팀 선 색 — 표의 체크박스 accent 와 추이 선이 같은 색을 씁니다 */
const SERIES = [
  "var(--purple)",
  "var(--blue)",
  "var(--green)",
  "var(--orange-ink)",
  "var(--red)",
  "var(--gray)",
];

/** 산점도·믹스 막대에서 색을 받는 모델 수. 나머지는 "기타"로 묶습니다 */
const MODEL_TOP_N = 4;

/** 그 모델이 팀 비용의 이 비중 이상이면 "쓰는 팀"으로 셉니다 */
const USING_THRESHOLD = 0.05;

const tokTxt = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(2)}B` : `${v.toFixed(1)}M`;

const growth = (now: number, prev: number) => (prev > 0 ? now / prev - 1 : 0);

const deltaColor = (d: number) =>
  d >= 0.1 ? "var(--red)" : d < 0 ? "var(--green)" : "var(--text3)";

export function buildTeams(
  compare: CompareKey = "prev_week",
  dates: DateRange = { start: "2026-09-07", end: SAMPLE_END },
  catalog: Team[] = SEED_TEAMS,
) {
  const label = (name: string) => teamLabel(catalog, name);
  const current = aggregateActivity(dates);
  const previous = aggregateActivity(comparisonRange(dates, compare));

  const showDelta =
    compare !== "none" && current.complete && previous.complete && previous.cost > 0;
  const compareLabel =
    compare === "none"
      ? ""
      : compare === "prev_week"
        ? "전주 대비"
        : "이전 기간 대비";

  /* ── 팀 행 ─────────────────────────────────────────────
     비용 내림차순이 기본 정렬이자 선 색 배정 순서입니다. */
  const teams = current.teams
    .map((team) => {
      const prev = previous.teams.find((item) => item.team === team.team);
      return {
        team: team.team,
        unmapped: team.team === "미배정",
        users: team.users,
        cost: team.cost,
        tokensM: team.tokensM,
        sessions: team.sessions,
        models: team.models,
        costD: growth(team.cost, prev?.cost ?? 0),
        tokenD: growth(team.tokensM, prev?.tokensM ?? 0),
        sessionD: growth(team.sessions, prev?.sessions ?? 0),
      };
    })
    .sort((a, b) => b.cost - a.cost);

  const colorOf = (name: string) =>
    SERIES[teams.findIndex((t) => t.team === name) % SERIES.length];

  /* ── 축 3종 ────────────────────────────────────────── */
  const maxOf = (pick: (t: (typeof teams)[number]) => number) =>
    Math.max(...teams.map(pick), 1);

  const buildRows = (
    pick: (t: (typeof teams)[number]) => {
      n: number;
      n2: number;
      n3: number;
      v1: string;
      v2: string;
      v3: string;
      d: number;
    },
    max: number,
    barColor: string,
  ) =>
    teams
      .map((t) => ({ t, d: pick(t) }))
      .sort((a, b) => b.d.n - a.d.n)
      .map(({ t, d }) => ({
        team: label(t.team),
        unmapped: t.unmapped,
        v1: d.v1,
        v2: d.v2,
        v3: d.v3,
        totalValue: d.n,
        perUserValue: d.n2,
        unitValue: d.n3,
        deltaValue: showDelta ? d.d : null,
        width: `${((d.n / max) * 100).toFixed(1)}%`,
        // 미배정은 팀이 아니라 "귀속 실패"라서 팀 색을 주지 않습니다
        fill: t.unmapped ? "var(--gray)" : barColor,
        series: colorOf(t.team),
        delta: showDelta ? pct(d.d) : "—",
        deltaColor: deltaColor(d.d),
      }));

  const orgCost = teams.reduce((n, t) => n + t.cost, 0);
  const orgTokens = teams.reduce((n, t) => n + t.tokensM, 0);
  const orgSessions = teams.reduce((n, t) => n + t.sessions, 0);

  const axes: Record<
    AxisKey,
    {
      title: string;
      total: string;
      delta: string;
      deltaColor: string;
      c1: string;
      c2: string;
      c3: string;
      rows: ReturnType<typeof buildRows>;
      format: (v: number) => string;
      value: (t: (typeof teams)[number]) => number;
    }
  > = {
    cost: {
      title: "비용",
      total: usd(orgCost),
      delta: showDelta ? pct(growth(current.cost, previous.cost)) : "—",
      deltaColor: "var(--red)",
      c1: "총 비용",
      c2: "사용자당",
      c3: "세션당",
      rows: buildRows(
        (t) => ({
          n: t.cost,
          n2: t.cost / (t.users || 1),
          n3: t.cost / (t.sessions || 1),
          v1: usd(t.cost),
          v2: usd(t.cost / (t.users || 1)),
          v3: usd(t.cost / (t.sessions || 1)),
          d: t.costD,
        }),
        maxOf((t) => t.cost),
        "var(--purple)",
      ),
      format: usd,
      value: (t) => t.cost,
    },
    token: {
      title: "토큰",
      total: tokTxt(orgTokens),
      delta: showDelta ? pct(growth(current.tokensM, previous.tokensM)) : "—",
      deltaColor: "var(--text3)",
      c1: "총 토큰",
      c2: "사용자당",
      c3: "백만당 비용",
      rows: buildRows(
        (t) => ({
          n: t.tokensM,
          n2: t.tokensM / (t.users || 1),
          n3: t.cost / (t.tokensM || 1),
          v1: tokTxt(t.tokensM),
          v2: tokTxt(t.tokensM / (t.users || 1)),
          v3: usd(t.cost / (t.tokensM || 1)),
          d: t.tokenD,
        }),
        maxOf((t) => t.tokensM),
        "var(--blue)",
      ),
      format: tokTxt,
      value: (t) => t.tokensM,
    },
    session: {
      title: "세션",
      total: int(orgSessions),
      delta: showDelta ? pct(growth(current.sessions, previous.sessions)) : "—",
      deltaColor: "var(--text3)",
      c1: "세션",
      c2: "사용자당",
      c3: "세션당 토큰",
      rows: buildRows(
        (t) => ({
          n: t.sessions,
          n2: t.sessions / (t.users || 1),
          n3: t.tokensM / (t.sessions || 1),
          v1: int(t.sessions),
          v2: (t.sessions / (t.users || 1)).toFixed(1),
          // 세션당 토큰은 M 단위로는 너무 작아 K 로 내립니다
          v3: `${((t.tokensM / (t.sessions || 1)) * 1000).toFixed(1)}K`,
          d: t.sessionD,
        }),
        maxOf((t) => t.sessions),
        "var(--green)",
      ),
      format: (v) => int(Math.round(v)),
      value: (t) => t.sessions,
    },
  };

  /* ── 일별 누적 추이 ──────────────────────────────────
     누적인 이유: 일별 값은 주말 골짜기 때문에 팀 간 비교가 안 됩니다.
     누적선의 기울기가 곧 그 팀의 소비 속도입니다. */
  const dayLabels = current.days.map((d) => {
    const [, m, day] = d.date.split("-");
    return `${Number(m)}/${Number(day)}`;
  });

  const seriesOf = (axis: AxisKey) =>
    teams.map((t) => {
      let run = 0;
      const values = current.days.map((day) => {
        const record = day.teams.find((x) => x.team === t.team);
        const amount = !record
          ? 0
          : axis === "cost"
            ? record.cost
            : axis === "token"
              ? record.tokensM
              : record.sessions;
        run += amount;
        return run;
      });
      return { team: label(t.team), color: colorOf(t.team), values };
    });

  const trend: Record<AxisKey, { team: string; color: string; values: number[] }[]> = {
    cost: seriesOf("cost"),
    token: seriesOf("token"),
    session: seriesOf("session"),
  };

  /* ── 모델 산점도 ─────────────────────────────────────
     x = 토큰(사용량), y = 비용. 기준선 위에 있으면 평균보다 비싼 모델입니다. */
  const modelCost = MODEL_META.map((m) =>
    teams.reduce((n, t) => n + (t.models[m.v] ?? 0), 0),
  );
  // 토큰은 단가의 역수로 배분합니다 — 싼 모델이 같은 돈으로 더 많은 토큰을 삽니다
  const tokWeight = MODEL_META.map((m, i) => modelCost[i] / m.perM);
  const tokWeightSum = tokWeight.reduce((n, v) => n + v, 0) || 1;

  const models = MODEL_META.map((m, i) => {
    const cost = modelCost[i];
    const tokens = (orgTokens * tokWeight[i]) / tokWeightSum;
    return {
      key: m.v,
      name: m.name,
      cost,
      tokens,
      perM: cost / (tokens || 1),
      teamsUsing: teams.filter(
        (t) => (t.models[m.v] ?? 0) / (t.cost || 1) >= USING_THRESHOLD,
      ).length,
    };
  }).sort((a, b) => b.cost - a.cost);

  const topModels = models.slice(0, MODEL_TOP_N);
  const restModels = models.slice(MODEL_TOP_N);
  const restCost = restModels.reduce((n, m) => n + m.cost, 0);

  const scatter = {
    points: topModels.map((m) => ({
      key: m.key,
      x: m.tokens,
      y: m.cost,
      // 점 크기는 세 번째 차원 — 이 모델을 실제로 쓰는 팀 수
      size: 12 + m.teamsUsing * 3,
      color: MODEL_COLORS[m.key] ?? "var(--gray)",
      label: m.name.replace("claude-", "").replace("gpt-5-", ""),
      sub: `${usd(m.perM)}/M`,
      tip: `${m.name} · 토큰 ${tokTxt(m.tokens)} · 비용 ${usd(m.cost)} · 백만당 ${usd(m.perM)} · 사용 팀 ${m.teamsUsing}`,
    })),
    xMax: Math.max(...topModels.map((m) => m.tokens), 1) * 1.15,
    yMax: Math.max(...topModels.map((m) => m.cost), 1) * 1.15,
    /** 전사 평균 단가 — 이 기울기가 손익분기선입니다 */
    avgPerM: orgCost / (orgTokens || 1),
  };

  const legend = topModels
    .map((m) => ({
      key: m.key,
      short: m.name.replace("claude-", "").replace("gpt-5-", ""),
      color: MODEL_COLORS[m.key] ?? "var(--gray)",
    }))
    .concat(
      restCost > 0
        ? [{ key: "__rest", short: `기타 ${restModels.length}개`, color: "var(--gray)" }]
        : [],
    );

  /**
   * 팀별 모델 믹스 — 세로 기둥.
   *
   * 기둥 높이는 선택한 축의 실제 값입니다. 100% 로 정규화하면 구성비만 남고
   * 팀 크기가 사라져서, 3% 를 쓰는 팀과 40% 를 쓰는 팀이 같은 높이로 보입니다.
   * 색은 상위 4개 모델 + 나머지를 기타로 묶어 기둥 안의 합이 항상 100% 입니다.
   */
  const mix = (axis: AxisKey) => {
    const ordered = [...teams].sort(
      (a, b) => axes[axis].value(b) - axes[axis].value(a),
    );
    const max = Math.max(...ordered.map((t) => axes[axis].value(t)), 1);
    const format = axes[axis].format;

    return {
      yTop: format(max),
      yMid: format(max / 2),
      columns: ordered.map((t) => {
        const value = axes[axis].value(t);
        const shares = topModels.map((m) => {
          const share = (t.models[m.key] ?? 0) / (t.cost || 1);
          return {
            key: m.key,
            share,
            color: MODEL_COLORS[m.key] ?? "var(--gray)",
            tip: `${label(t.team)} · ${m.name} ${(share * 100).toFixed(1)}% · ${format(value * share)}`,
          };
        });
        const rest = 1 - shares.reduce((n, s) => n + s.share, 0);
        const top = [...shares].sort((a, b) => b.share - a.share)[0];
        const topName =
          topModels.find((m) => m.key === top.key)?.name.replace("claude-", "") ?? "";

        return {
          team: label(t.team),
          unmapped: t.unmapped,
          height: `${((value / max) * 100).toFixed(1)}%`,
          totalText: format(value),
          segments: shares.concat(
            rest > 0.001
              ? [
                  {
                    key: "__rest",
                    share: rest,
                    color: "var(--gray)",
                    tip: `${label(t.team)} · 기타 ${(rest * 100).toFixed(1)}% · ${format(value * rest)}`,
                  },
                ]
              : [],
          ),
          topText: `${topName} ${(top.share * 100).toFixed(0)}%`,
        };
      }),
    };
  };

  /* ── 사용자별 사용량 ─────────────────────────────────
     팀 값을 개인으로 쪼갭니다. 자식의 합이 팀 값과 정확히 일치해야 하므로
     가중치는 평균 1.0 으로 정규화하고, 세션은 정수라 최대잉여법으로 나눕니다 —
     개별 반올림은 합계를 팀 값과 어긋나게 만듭니다. */
  const users = (teamName: string) => {
    const t = teams.find((x) => label(x.team) === teamName) ?? teams.find((x) => x.team === teamName) ?? teams[0];
    const count = Math.max(1, t.users);
    const avgCost = t.cost / count;

    // 명단은 P6 구성원과 공유합니다 — 같은 사람이 페이지마다 다른 값을 가지면 안 됩니다
    const roster = buildRoster(t, topModels, rosterOffsets(current.teams)[t.team]);

    const rows = roster.map((u) => ({
      ...u,
      team: label(u.team),
      sessions: int(u.sessionCount),
      tokens: tokTxt(u.tokenValue),
      cost: usd(u.costValue),
      cache: `${(u.cacheValue * 100).toFixed(0)}%`,
      // 캐시 적중이 낮으면 같은 작업에 토큰을 두 번 내고 있다는 뜻입니다
      cacheColor: u.cacheValue < 0.6 ? "var(--orange-ink)" : "var(--text2)",
      deviationText:
        Math.abs(u.deviation) < 0.005
          ? ""
          : `${u.deviation > 0 ? "+" : "−"}${Math.abs(u.deviation * 100).toFixed(0)}%`,
      deviationColor:
        u.deviation >= 0.25
          ? "var(--orange-ink)"
          : u.deviation <= -0.25
            ? "var(--text3)"
            : "var(--text2)",
      model: u.modelName.replace("claude-", ""),
      last:
        u.idleDays === 0 ? "오늘" : u.idleDays === 1 ? "어제" : `${u.idleDays}일 전`,
      lastColor: u.idleDays >= 7 ? "var(--orange-ink)" : "var(--text2)",
    }));

    // 캐시 적중은 합이 아니라 토큰 가중평균입니다 — 단순 평균은 소량 사용자에 끌려갑니다
    const cacheAvg =
      rows.reduce((n, u) => n + u.cacheValue * u.tokenValue, 0) /
      (rows.reduce((n, u) => n + u.tokenValue, 0) || 1);

    return {
      team: label(t.team),
      rows,
      note: `팀 평균 ${usd(avgCost)} 대비 편차`,
      stats: [
        { key: "사용자", value: int(count), sub: "명", tone: "var(--text)" },
        {
          key: "세션",
          value: int(rows.reduce((n, u) => n + u.sessionCount, 0)),
          sub: "건",
          tone: "var(--text)",
        },
        {
          key: "총 토큰",
          value: tokTxt(rows.reduce((n, u) => n + u.tokenValue, 0)),
          sub: "",
          tone: "var(--text)",
        },
        {
          key: "환산 금액",
          value: usd(rows.reduce((n, u) => n + u.costValue, 0)),
          sub: "",
          tone: "var(--text)",
        },
        {
          key: "캐시 적중 (가중평균)",
          value: `${(cacheAvg * 100).toFixed(0)}%`,
          sub: "",
          tone: cacheAvg < 0.6 ? "var(--orange-ink)" : "var(--text)",
        },
      ],
      /** 보이는 만큼의 합계와 팀 전체를 같이 적어 "일부만 보고 있음"을 숨기지 않습니다 */
      sumNote: (shown: readonly { costValue: number }[]) => {
        const shownCost = shown.reduce((n, u) => n + u.costValue, 0);
        return shown.length < rows.length
          ? `${shown.length}명 합계 ${usd(shownCost)} · 팀 전체 ${usd(t.cost)}`
          : `${rows.length}명 합계 ${usd(shownCost)} = 팀 ${usd(t.cost)}`;
      },
    };
  };

  return {
    isEmpty: current.days.length === 0,
    periodLabel: `${dates.start} ~ ${dates.end ?? dates.start}`,
    details: teams.map((team) => {
      const prev = previous.teams.find((item) => item.team === team.team);
      const perUser = team.cost / (team.users || 1);
      return {
        team: label(team.team),
        unmapped: team.unmapped,
        users: int(team.users),
        costText: usd(team.cost),
        perUserText: usd(perUser),
        perUserDelta: showDelta ? pct(growth(perUser, (prev?.cost ?? 0) / (prev?.users || 1))) : "—",
        sessions: int(team.sessions),
        tokens: tokTxt(team.tokensM),
        contribText: showDelta ? signedUsd(team.cost - (prev?.cost ?? 0)) : "—",
        models: MODEL_META.map((model) => ({
          name: model.name,
          share: (team.models[model.v] ?? 0) / (team.cost || 1) * 100,
          color: MODEL_COLORS[model.v] ?? "var(--gray)",
        })).sort((a, b) => b.share - a.share),
      };
    }),
    headerNote:
      `팀별 비교 · ${dates.start} ~ ${dates.end ?? dates.start}` +
      (compareLabel ? ` · ${compareLabel}` : ""),
    compareLabel,
    showDelta,
    teams: teams.map((t) => ({ team: label(t.team), color: colorOf(t.team) })),
    axes,
    dayLabels,
    trend,
    scatter,
    legend,
    mix,
    users,
    /** 사용자 표 한 번에 보여줄 인원 */
    userPageSize: 12,
  };
}
