import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Bar,
  ReferenceLine,
  ReferenceDot,
} from 'recharts';
import { Badge, Button, KpiCard, WidgetCard, WidgetState } from '../../components/ui';
import { Widget, Result, DataTable, axis, tip, q, shortDate } from '../../widgets/Widget';
import { useWidget } from '../../widgets/useWidget';
import { number, series, format, timeline, type Point } from '../../widgets/model';
import { useScopedFilters } from '../../app/filterContext';
import { writeFilters } from '../../app/filters';
import type { QueryResult } from '../../api/types';
import { kpiSpecs, overviewQueries as queries } from './queries';
import s from './Overview.module.css';
const color = (name: string) => `var(--accent-${name})`;
const blues = [2, 1, 3, 4].map((n) => `var(--chart-seq${n})`);
const fullDate = (v?: string) =>
  v
    ? new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(v))
    : '—';
const compareLabel = (v: string | undefined) =>
  v === 'previous_week' ? '전주 대비' : '직전 기간 대비';
function delta(p: Point | undefined, compare: string | undefined, ratio = false) {
  const a = number(p?.value),
    b = number(p?.previous);
  if (compare === 'none' || a === null || b === null) return undefined;
  const diff = ratio ? (a - b) * 100 : b !== 0 ? (a / b - 1) * 100 : null;
  return {
    text:
      diff === null
        ? '비교 불가'
        : `${diff >= 0 ? '▲ +' : '▼ '}${diff.toFixed(1)}${ratio ? 'pt' : '%'}`,
    tone: 'gray' as const,
    comparison: compareLabel(compare),
  };
}
function Kpi({ spec }: { spec: (typeof kpiSpecs)[number] }) {
  const { ref, query, scope } = useWidget('overview-kpi-' + spec.metric, [q(spec.metric)]);
  const model = series(query.data?.results.A),
    p = model.points[0];
  const removed = model.points.find((p) => p.labels.type === 'removed');
  const a = number(p?.value),
    b = number(removed?.value);
  return (
    <div ref={ref} data-kpi={spec.metric} className={s.kpi}>
      {query.isPending || query.isError || model.state === 'error' ? (
        <WidgetCard title={spec.label}>
          <WidgetState
            status={query.isPending ? 'loading' : 'error'}
            onRetry={() => query.refetch()}
          />
        </WidgetCard>
      ) : (
        <KpiCard
          label={spec.label}
          definition={spec.caption}
          value={
            (spec.metric === 'lines_of_code' && a !== null ? '+' : '') + format(p?.value, p?.unit)
          }
          unit={a !== null ? spec.unit : undefined}
          secondary={
            removed
              ? { value: (b !== null ? '−' : '') + format(removed.value), label: '삭제' }
              : undefined
          }
          delta={(() => {
            const d = delta(p, scope.value.compare, spec.metric === 'adoption_rate');
            if (d && ['active_users', 'adoption_rate'].includes(spec.metric))
              return {
                ...d,
                tone: (number(p?.value) ?? 0) >= (number(p?.previous) ?? 0) ? 'green' : 'red',
              };
            return d;
          })()}
          caption={
            model.state === 'masked'
              ? 'n<5 · 최소 집계 단위 미만'
              : spec.metric === 'adoption_rate'
                ? `분모: 활성 구성원 ${query.data?.coverage?.active_members ?? '—'}`
                : spec.metric === 'lines_of_code' && a !== null && b !== null
                  ? `추가 / 삭제 · 순증 ${(a - b).toLocaleString()}`
                  : spec.caption
          }
        />
      )}
    </div>
  );
}
function Chart({
  points,
  secondary,
  anomalies,
  compare = false,
}: {
  points: Point[];
  secondary?: Point[];
  anomalies?: Point[];
  compare?: boolean;
}) {
  const rows = points.map((p) => ({
    time: p.key,
    value: number(p.value),
    previous: number(p.previous),
    contract: number(secondary?.find((b) => b.key === p.key)?.value),
  }));
  return (
    <div className={s.chart}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 5, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border-default)" strokeDasharray="3 3" />
          <XAxis
            {...axis}
            dataKey="time"
            tickFormatter={(v) => shortDate(Number(v))}
            minTickGap={22}
          />
          <YAxis {...axis} width={58} tickFormatter={(v) => '$' + v.toLocaleString()} />
          <Tooltip contentStyle={tip} labelFormatter={(v) => shortDate(Number(v))} />
          {anomalies
            ?.filter((p) => (number(p.value) ?? 0) > 2)
            .map((p) => (
              <ReferenceDot
                key={p.key}
                x={p.key}
                y={number(points.find((a) => a.key === p.key)?.value) ?? 0}
                r={4}
                fill={color('red')}
                stroke="var(--surface-card)"
                label={{
                  value: `스파이크 +${((number(p.value) ?? 0) * 100).toFixed(0)}%`,
                  position: 'insideTopRight',
                  fontSize: 11,
                  fill: color('red'),
                }}
              />
            ))}
          <Line
            dataKey="value"
            name="공시"
            stroke={color('purple')}
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
          />
          {secondary && (
            <Line
              dataKey="contract"
              name="계약"
              stroke={color('lav')}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
            />
          )}{' '}
          {compare && (
            <Line
              dataKey="previous"
              name="비교 기간 · 공시"
              stroke={color('purple')}
              strokeOpacity={0.45}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
function PublicRows({
  result,
  retry,
  children,
}: {
  result?: QueryResult;
  retry: () => void;
  children: (p: Point[]) => ReactNode;
}) {
  const m = series(result);
  if (m.state === 'error' || !m.points.length)
    return <WidgetState status={m.state === 'error' ? 'error' : 'empty'} onRetry={retry} />;
  return (
    <>
      {children(m.points)}
      <DataTable points={m.points} title="그룹별" />
    </>
  );
}
function TeamCosts({ points }: { points: Point[] }) {
  const { value, options } = useScopedFilters();
  const maximum = Math.max(1, ...points.map((p) => number(p.value) || 0));
  const ordered = [...points].sort((a, b) => (number(b.value) ?? -1) - (number(a.value) ?? -1));
  return (
    <div className={s.teamBars}>
      {ordered.map((p, i) => {
        const team = options.data?.teams?.find((t) => t.team_id === p.labels.team);
        const v = number(p.value);
        const content = (
          <>
            <span>{team?.name || p.labels.team_name || '기타'}</span>
            <span className={s.track}>
              <i
                className={p.value.state === 'masked' ? s.masked : ''}
                style={{ width: v === null ? '18%' : `${(v / maximum) * 100}%` }}
              />
            </span>
            <span>{p.value.state === 'masked' ? 'n<5' : format(p.value, 'USD')}</span>
          </>
        );
        return team?.team_id ? (
          <Link
            key={i}
            to={
              '/teams?' +
              writeFilters({ ...value, filters: { ...value.filters, team_ids: [team.team_id] } })
            }
            aria-label={`${team.name} 팀 분석`}
          >
            {content}
          </Link>
        ) : (
          <div key={i}>{content}</div>
        );
      })}
    </div>
  );
}
function Models({ points, users }: { points: Point[]; users?: QueryResult }) {
  const values = points.map((p) => ({ name: p.labels.model, value: number(p.value) || 0 }));
  const total = values.reduce((s, p) => s + p.value, 0),
    people = series(users);
  return (
    <div className={s.models}>
      <div className={s.donut}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={values}
              dataKey="value"
              innerRadius={44}
              outerRadius={59}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
            >
              {values.map((_, i) => (
                <Cell key={i} fill={blues[i % 4]} stroke="var(--surface-card)" />
              ))}
            </Pie>
            <Tooltip contentStyle={tip} />
          </PieChart>
        </ResponsiveContainer>
        <div className={s.donutLabel}>
          {Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(total)}
          <small>토큰</small>
        </div>
      </div>
      <div className={s.modelList}>
        {values.map((v, i) => (
          <div key={v.name}>
            <i style={{ background: blues[i % 4] }} />
            <code title={v.name}>{v.name}</code>
            <span>{total ? ((v.value / total) * 100).toFixed(0) + '%' : '분모 0'}</span>
            <small>{format(people.points.find((p) => p.labels.model === v.name)?.value)}명</small>
          </div>
        ))}
      </div>
    </div>
  );
}
function Output({ results, retry }: { results: Record<string, QueryResult>; retry: () => void }) {
  const base = series(results.A),
    commits = series(results.B),
    prs = series(results.C);
  const combined: QueryResult = {
    status: 200,
    frames: [results.A, results.B, results.C]
      .filter((r) => r?.status === 200)
      .flatMap((r) => r.frames),
  };
  const rows = timeline([...base.points, ...commits.points, ...prs.points]).map((r) => ({
    ...r,
    removed: typeof r.removed === 'number' ? -r.removed : null,
    commits: number(commits.points.find((p) => p.key === r.time)?.value),
    pr: number(prs.points.find((p) => p.key === r.time)?.value),
  }));
  return (
    <div className={s.output}>
      <div>
        <Result result={combined} title="산출" retry={retry}>
          {() => (
            <div className={s.outputChart}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rows} stackOffset="sign">
                  <defs>
                    <pattern
                      id="overview-output-stripes"
                      patternUnits="userSpaceOnUse"
                      width="640"
                      height="360"
                    >
                      <image href="/assets/output-stripes.svg" width="640" height="360" />
                    </pattern>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--border-default)" />
                  <XAxis {...axis} dataKey="time" tickFormatter={(v) => shortDate(Number(v))} />
                  <YAxis {...axis} width={44} tickFormatter={(v) => `${v / 1000}k`} />
                  <YAxis {...axis} yAxisId="counts" orientation="right" width={42} />
                  <Tooltip contentStyle={tip} labelFormatter={(v) => shortDate(Number(v))} />
                  <ReferenceLine y={0} stroke="var(--text-3)" />
                  <Bar
                    name="추가 LoC"
                    dataKey="added"
                    stackId="loc"
                    fill={color('green')}
                    maxBarSize={30}
                    isAnimationActive={false}
                  />
                  <Bar
                    name="삭제 LoC"
                    dataKey="removed"
                    stackId="loc"
                    fill="url(#overview-output-stripes)"
                    maxBarSize={30}
                    isAnimationActive={false}
                  />
                  <Line
                    name="커밋"
                    dataKey="commits"
                    yAxisId="counts"
                    stroke={color('green')}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    name="PR"
                    dataKey="pr"
                    yAxisId="counts"
                    stroke={color('green')}
                    strokeDasharray="4 3"
                    dot={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Result>
        {['A', 'B', 'C'].map((id, i) =>
          series(results[id]).state === 'success' ? (
            <DataTable
              key={id}
              points={series(results[id]).points}
              title={['LoC', '커밋', 'PR'][i]}
            />
          ) : (
            <WidgetState
              key={id}
              status={
                series(results[id]).state === 'success'
                  ? 'empty'
                  : (series(results[id]).state as 'error' | 'empty' | 'masked')
              }
              onRetry={retry}
            />
          ),
        )}
      </div>
      <div className={s.depth}>
        <Scalar result={results.D} title="통합 깊이" retry={retry} ratioAsNumber />
        <small>(커밋 + PR) / fresh 세션</small>
      </div>
    </div>
  );
}
function Adoption({ points }: { points: Point[] }) {
  const { options, value } = useScopedFilters();
  const weeks = [...new Set(points.map((p) => p.key))];
  const teams = [...new Set(points.map((p) => p.labels.team))];
  return (
    <div className={s.heatScroll}>
      <div
        className={s.heat}
        style={{ gridTemplateColumns: `120px repeat(${weeks.length},minmax(58px,1fr))` }}
      >
        <span />
        {weeks.map((w) => (
          <span key={w}>{shortDate(Number(w))}</span>
        ))}
        {teams.map((id) => {
          const t = options.data?.teams?.find((t) => t.team_id === id);
          return (
            <Fragment key={id}>
              <Link
                to={
                  '/teams?' +
                  writeFilters({ ...value, filters: { ...value.filters, team_ids: [id] } })
                }
              >
                {t?.name || '팀'}{' '}
                <small>
                  {points
                    .filter((p) => p.labels.team === id)
                    .some((p) => p.value.state === 'masked')
                    ? 'n<5'
                    : `${t?.member_count ?? '—'}명`}
                </small>
              </Link>
              {weeks.map((w) => {
                const p = points.find((p) => p.labels.team === id && p.key === w);
                const n = number(p?.value);
                const level =
                  n === null ? 0 : n < 0.45 ? 1 : n < 0.55 ? 2 : n < 0.65 ? 3 : n < 0.75 ? 4 : 5;
                return (
                  <button
                    key={w}
                    className={p?.value.state === 'masked' ? s.masked : ''}
                    style={
                      level
                        ? {
                            background: `var(--chart-heat${level})`,
                            color: `var(--chart-heatfg${level})`,
                          }
                        : undefined
                    }
                    title={`${t?.name || '팀'} · ${shortDate(Number(w))} · ${p?.value.state === 'masked' ? 'n<5' : format(p?.value, 'ratio') + '%'}`}
                  >
                    {p?.value.state === 'masked'
                      ? 'n<5'
                      : format(p?.value, 'ratio') + (n !== null ? '%' : '')}
                  </button>
                );
              })}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
function Scalar({
  result,
  title,
  retry,
  ratioAsNumber = false,
  showComparison = true,
}: {
  result?: QueryResult;
  title: string;
  retry: () => void;
  ratioAsNumber?: boolean;
  showComparison?: boolean;
}) {
  const { value } = useScopedFilters();
  return (
    <Result result={result} title={title} retry={retry}>
      {(points) => {
        const p = points[0],
          v = number(p.value);
        const d = delta(p, value.compare, p.unit === 'ratio');
        return (
          <div className={s.stat}>
            <span>{title}</span>
            <strong>
              {ratioAsNumber && v !== null ? v.toFixed(2) : format(p.value, p.unit)}
              {p.unit === 'ratio' && !ratioAsNumber ? '%' : ''}
            </strong>
            {d && !ratioAsNumber && showComparison && <small>{d.text}</small>}
          </div>
        );
      }}
    </Result>
  );
}
function Spark({
  points,
  stroke,
  second = false,
}: {
  points: Point[];
  stroke: string;
  second?: boolean;
}) {
  const rows = second
    ? timeline(points, 'percentile')
    : points.map((p) => ({ time: p.key, value: number(p.value) }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows}>
        <XAxis hide dataKey="time" />
        <Tooltip contentStyle={tip} labelFormatter={(v) => shortDate(Number(v))} />
        <Line
          dataKey={second ? 'p50' : 'value'}
          stroke={stroke}
          dot={false}
          isAnimationActive={false}
        />
        {second && (
          <Line
            dataKey="p90"
            stroke={color('blue2')}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
function Health({ results, retry }: { results: Record<string, QueryResult>; retry: () => void }) {
  return (
    <div className={s.health}>
      <Result result={results.A} title="API 에러율" retry={retry}>
        {(points) => {
          const latest = points.at(-1),
            max = Math.max(...points.map((p) => number(p.value) ?? 0));
          return (
            <>
              <p>
                API 에러율{' '}
                <span>
                  {format(latest?.value, 'ratio')}% · 최대 {(max * 100).toFixed(1)}%
                </span>
              </p>
              <div className={s.spark}>
                <Spark points={points} stroke={color('red')} />
              </div>
            </>
          );
        }}
      </Result>
      <Result result={results.B} title="TTFT" retry={retry}>
        {(points) => (
          <>
            <p>
              TTFT p50 / p90{' '}
              <span>
                {format(points.filter((p) => p.labels.percentile === 'p50').at(-1)?.value)} /{' '}
                {format(points.filter((p) => p.labels.percentile === 'p90').at(-1)?.value)} ms
              </span>
            </p>
            <div className={s.spark}>
              <Spark points={points} stroke={color('blue')} second />
            </div>
          </>
        )}
      </Result>
      <div className={s.timeLabels}>
        <span>−24h</span>
        <span>−12h</span>
        <span>지금</span>
      </div>
    </div>
  );
}
export function Overview() {
  const scope = useScopedFilters();
  const { value, options, role } = scope;
  const { ref, query: coverage } = useWidget('coverage', [q('telemetry_coverage')]);
  const masked = series(coverage.data?.results.A).state === 'masked';
  const governanceAllowed = role === 'owner' && !value.filters?.team_ids?.length;
  return (
    <section ref={ref} className={s.page}>
      <header className={s.title}>
        <h1>개요</h1>
        <span>
          {value.filters?.team_ids?.length
            ? options.data?.teams?.find((t) => t.team_id === value.filters?.team_ids?.[0])?.name
            : '조직 전체'}{' '}
          · {fullDate(coverage.data?.resolved_from)} ~ {fullDate(coverage.data?.resolved_to)} ·{' '}
          {value.price_basis === 'contract' ? '계약' : '공시'} 단가
        </span>
        <p>
          개인 이름·개인 순위 없음 · 그룹 5명 미만 <Badge>n&lt;5</Badge> 마스킹
        </p>
      </header>
      {coverage.isPending ? (
        <WidgetState status="loading" />
      ) : coverage.isError && !coverage.data ? (
        <WidgetState status="error" onRetry={() => coverage.refetch()} />
      ) : masked ? (
        <div className={s.maskedPage}>
          <WidgetState status="masked" />
          <Button onClick={() => scope.update({ filters: { ...value.filters, team_ids: [] } })}>
            접근 가능한 전체 팀으로 돌아가기
          </Button>
        </div>
      ) : (
        <>
          <div className={s.kpis}>
            {kpiSpecs.map((spec) => (
              <Kpi key={spec.metric} spec={spec} />
            ))}
          </div>
          <div className={s.grid}>
            <Widget
              id="overview-cost"
              headerLegend={
                <div className={s.lineLegend}>
                  <span>공시</span>
                  <span>계약</span>
                  {value.compare !== 'none' && <span>비교</span>}
                  <span>스파이크</span>
                </div>
              }
              title="비용 추세"
              subtitle="일 단위 · USD"
              definition="공시와 계약 단가의 일별 추정 비용. 비교선은 공시 단가 기준입니다."
              caption="청구액 아님 · 공시 실선 / 계약 점선 / 비교 연한 점선 · 스파이크: 직전 7일 평균 +200% 초과"
              queries={queries.cost}
            >
              {(r, retry) => (
                <>
                  <Result result={r.A} title="공시 비용" retry={retry}>
                    {(p) => (
                      <Chart
                        points={p}
                        anomalies={series(r.C).state === 'success' ? series(r.C).points : undefined}
                        secondary={series(r.B).state === 'success' ? series(r.B).points : undefined}
                        compare={value.compare !== 'none'}
                      />
                    )}
                  </Result>
                  {series(r.B).state === 'success' ? (
                    <DataTable points={series(r.B).points} title="계약 비용" />
                  ) : (
                    <WidgetState
                      status={
                        series(r.B).state === 'success'
                          ? 'empty'
                          : (series(r.B).state as 'error' | 'empty' | 'masked')
                      }
                      onRetry={retry}
                    />
                  )}
                  <Result result={r.C} title="비용 이상" retry={retry}>
                    {() => null}
                  </Result>
                </>
              )}
            </Widget>
            <Widget
              id="overview-teams"
              title="팀별 비용"
              subtitle={`상위 10팀 · ${value.price_basis === 'contract' ? '계약' : '공시'}`}
              definition="팀별 비용. 5명 미만 팀의 값과 막대 길이는 비공개입니다."
              caption="청구액 아님 · 클릭 → 팀 분석"
              queries={queries.teams}
            >
              {(r, retry) => (
                <PublicRows result={r.A} retry={retry}>
                  {(p) => <TeamCosts points={p} />}
                </PublicRows>
              )}
            </Widget>
            <Widget
              id="overview-models"
              title="모델 점유율"
              subtitle="토큰 비중"
              definition="입력과 출력 토큰 합의 모델별 비중입니다."
              caption="입력+출력 토큰 합 · 사용자 수는 모델별 중복 집계"
              queries={queries.models}
            >
              {(r, retry) => (
                <>
                  <Result result={r.A} title="모델 토큰" retry={retry}>
                    {(p) => <Models points={p} users={r.B} />}
                  </Result>
                  {series(r.B).state === 'success' ? (
                    <DataTable points={series(r.B).points} title="모델 사용자" />
                  ) : (
                    <WidgetState
                      status={
                        series(r.B).state === 'success'
                          ? 'empty'
                          : (series(r.B).state as 'error' | 'empty' | 'masked')
                      }
                      onRetry={retry}
                    />
                  )}
                </>
              )}
            </Widget>
            <Widget
              id="overview-output"
              headerLegend={
                <div className={s.outputLegend}>
                  <span>LoC 추가</span>
                  <span>삭제</span>
                  <span>커밋</span>
                  <span>PR</span>
                </div>
              }
              title="산출 추세"
              subtitle="완료된 최근 8주"
              definition="AI 관여 LoC와 커밋·PR. 통합 깊이는 (커밋+PR) ÷ fresh 세션입니다."
              caption="LoC 추가/삭제 · 커밋 실선/PR 점선 · 미관측 ≠ 미사용"
              queries={queries.output}
              recentWeeks
            >
              {(r, retry) => <Output results={r} retry={retry} />}
            </Widget>
            <Widget
              id="overview-adoption"
              headerLegend={
                <div className={s.heatLegend}>
                  <span>&lt;45%</span>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <i key={n} style={{ background: `var(--chart-heat${n})` }} />
                  ))}
                  <span>≥75%</span>
                  <i className={s.masked} />
                  n&lt;5
                </div>
              }
              title="팀 × 주 도입률"
              subtitle="완료된 최근 8주 · 활성 인원순"
              definition="주간 활성 사용자 ÷ 활성 구성원. 작은 팀은 n<5로 표시합니다."
              caption="도입률 = 주간 활성 사용자 / 활성 구성원 · 팀 이름 클릭 → 팀 분석"
              queries={queries.adoption}
              recentWeeks
            >
              {(r, retry) => (
                <PublicRows result={r.A} retry={retry}>
                  {(p) => (
                    <>
                      <Adoption points={p} />
                    </>
                  )}
                </PublicRows>
              )}
            </Widget>
            <Widget
              id="overview-trust"
              title="신뢰"
              subtitle=""
              definition="사람 편집 결정의 수락률과 config/hook 자동 승인 비율을 함께 읽습니다."
              caption="수락률은 성과 KPI가 아님 · 자동 승인과 함께 해석"
              queries={queries.trust}
            >
              {(r, retry) => (
                <div className={s.trust}>
                  {['A', 'B'].map((id, i) => (
                    <div key={id}>
                      <Scalar
                        result={r[id]}
                        title={i ? '자동 승인 비율' : '편집 수락률 (사람 결정만)'}
                        retry={retry}
                      />
                      <Result
                        result={r[i ? 'D' : 'C']}
                        title={i ? '자동 승인 추세' : '수락 추세'}
                        retry={retry}
                      >
                        {(p) => (
                          <div className={s.miniSpark}>
                            <Spark points={p} stroke={color('orange')} />
                          </div>
                        )}
                      </Result>
                    </div>
                  ))}
                </div>
              )}
            </Widget>
            <Widget
              id="overview-health"
              title="플랫폼 헬스"
              subtitle="최근 24h · 1h"
              definition="API 시도 실패율과 첫 토큰 응답 시간 p50/p90입니다. 재시도 단위 측정일 수 있습니다."
              caption="API 시도 실패율 · 429 포함 · 재시도 중복 가능"
              queries={queries.health}
              requestPatch={{ from: 'now-24h', to: 'now', compare: 'none' }}
            >
              {(r, retry) => <Health results={r} retry={retry} />}
            </Widget>
            <Widget
              id="overview-governance"
              title="거버넌스 요약"
              subtitle=""
              definition="안전 거부는 전사 합만 제공하며 훅 수집은 detailed tracing에 의존합니다."
              caption="안전 정책 거절 응답 · 홉 중복 가능 · 훅 미관측 ≠ 미사용"
              queries={governanceAllowed ? queries.governance : queries.governance.slice(1)}
            >
              {(r, retry) => (
                <div className={s.governance}>
                  {governanceAllowed ? (
                    <div className={s.refusals}>
                      <Scalar
                        result={r.A}
                        showComparison={false}
                        title="안전 거부 (전사 합만)"
                        retry={retry}
                      />
                      <Badge>부서 분해 없음</Badge>
                    </div>
                  ) : (
                    <p className={s.restricted}>안전 거부 · 전사 조회에서만 제공</p>
                  )}
                  <div className={s.hooks}>
                    <Scalar result={r.B} showComparison={false} title="훅 차단" retry={retry} />
                    <Result result={r.C} title="훅 실행" retry={retry}>
                      {(p) => {
                        const a = number(p.find((p) => p.key === 'sessions_with_hooks')?.value),
                          b = number(p.find((p) => p.key === 'sessions')?.value);
                        return (
                          <div className={s.stat}>
                            <span>훅 실행 세션 비율</span>
                            <strong>
                              {a === null || b === null
                                ? '미관측'
                                : b === 0
                                  ? '분모 0'
                                  : ((a / b) * 100).toFixed(1) + '%'}
                            </strong>
                          </div>
                        );
                      }}
                    </Result>
                  </div>
                </div>
              )}
            </Widget>
          </div>
        </>
      )}
    </section>
  );
}
