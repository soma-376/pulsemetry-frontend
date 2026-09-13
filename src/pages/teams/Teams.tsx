import { Widget, Result, DataTable, q, shortDate, axis, tip } from '../../widgets/Widget';
import { TeamDetails } from './TeamDetails';
import { useState } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LabelList,
  ReferenceLine,
  ComposedChart,
  CartesianGrid,
  Line,
  AreaChart,
  Area,
} from 'recharts';
import { Badge, Button, KpiCard, WidgetCard, WidgetState } from '../../components/ui';
import { useScopedFilters } from '../../app/filterContext';
import { useWidget } from '../../widgets/useWidget';
import { series, number, format, timeline, type Point } from '../../widgets/model';
import type { QueryRequest, QueryResult } from '../../api/types';
import s from './Teams.module.css';
type Query = QueryRequest['queries'][number];
const blue = [2, 1, 3, 4].map((n) => `var(--chart-seq${n})`);
const tokenColors = [1, 2, 3, 4].map((n) => `var(--chart-seq${n})`);
const violet = [1, 2, 3, 4].map((n) => `var(--chart-vio${n})`);
const day = (v?: string) =>
  v
    ? new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(v))
    : '—';
const kpis = [
  {
    metric: 'active_users',
    label: '활성 사용자',
    unit: '명',
    caption: 'user 활성시간>0',
    definition: '선택 기간에 사람 활성시간이 0보다 큰 구성원 수입니다.',
  },
  {
    metric: 'adoption_rate',
    label: '도입률',
    unit: '%',
    caption: '분모: 팀 활성 구성원',
    definition: '활성 사용자 ÷ 팀 활성 구성원. 분모가 0이면 비율을 계산하지 않습니다.',
  },
  {
    metric: 'cost',
    label: '비용',
    unit: 'USD',
    caption: '청구액 아님 · 단가 추정',
    definition: '관측된 호출의 보고 비용 또는 단가 추정 합계이며 실제 청구액과 다릅니다.',
  },
  {
    metric: 'active_time',
    label: '사람 활성시간',
    unit: '시간',
    caption: '팀 합계 · 개인 분해 없음',
    definition: 'active_time의 type=user 합계를 초에서 시간으로 변환합니다.',
  },
  {
    metric: 'automation_ratio',
    label: '자동화 시간 비율',
    unit: '%',
    caption: 'cli ÷ (user + cli)',
    definition: 'cli 활성시간 ÷ (user + cli 활성시간)입니다. 시간 절감률이 아닙니다.',
  },
] as const;
function Kpi({ spec }: { spec: (typeof kpis)[number] }) {
  const { ref, query, scope } = useWidget('team-' + spec.metric, [
    q(spec.metric, 'scalar', spec.metric === 'active_time' ? { group_by: ['type'] } : {}),
  ]);
  const model = series(query.data?.results.A);
  const point =
    spec.metric === 'active_time'
      ? model.points.find((p) => p.labels.type === 'user')
      : model.points[0];
  const current = number(point?.value),
    prev = number(point?.previous);
  let delta: { text: string; tone: 'green' | 'red' | 'gray'; comparison: string } | undefined;
  if (scope.value.compare !== 'none' && current !== null && prev !== null) {
    const ratio = point?.unit === 'ratio';
    const diff = ratio
      ? (current - prev) * 100
      : spec.metric === 'active_users'
        ? current - prev
        : prev !== 0
          ? (current / prev - 1) * 100
          : null;
    delta = {
      text:
        diff === null
          ? '비교 불가'
          : `${diff >= 0 ? '▲ +' : '▼ '}${diff.toFixed(ratio || spec.metric !== 'active_users' ? 1 : 0)}${ratio ? 'pt' : spec.metric === 'active_users' ? '명' : '%'}`,
      tone: spec.metric === 'cost' ? 'gray' : diff !== null && diff >= 0 ? 'green' : 'red',
      comparison: scope.value.compare === 'previous_week' ? '전주 대비' : '직전 기간 대비',
    };
  }
  return (
    <div ref={ref} className={s.kpi} data-kpi={spec.metric}>
      {query.isPending ? (
        <WidgetCard title={spec.label}>
          <WidgetState status="loading" />
        </WidgetCard>
      ) : query.isError || model.state === 'error' ? (
        <WidgetCard title={spec.label}>
          <WidgetState status="error" onRetry={() => query.refetch()} />
        </WidgetCard>
      ) : (
        <KpiCard
          label={spec.label}
          definition={spec.definition}
          value={format(point?.value, point?.unit)}
          unit={current === null ? undefined : spec.unit}
          delta={delta}
          caption={
            model.state === 'masked'
              ? 'n<5 · 최소 집계 단위 미만'
              : spec.metric === 'adoption_rate'
                ? `분모: 팀 활성 구성원 ${query.data?.coverage?.active_members ?? '—'}`
                : spec.metric === 'active_users'
                  ? `${model.frames[0]?.meta?.active_user_definition === 'any_event' ? '기간 내 이벤트≥1' : spec.caption} · 팀 인원 ${query.data?.coverage?.active_members ?? '—'}`
                  : spec.caption
          }
        />
      )}
    </div>
  );
}
function Sessions({ points }: { points: Point[] }) {
  const values = points.map((p) => ({ name: p.labels.start_type, value: number(p.value) || 0 }));
  const total = values.reduce((sum, p) => sum + p.value, 0);
  return (
    <div className={s.sessions}>
      <div className={s.donut}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={values}
              dataKey="value"
              innerRadius={38}
              outerRadius={54}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
            >
              {values.map((_, i) => (
                <Cell key={i} fill={blue[i % 4]} stroke="var(--surface-card)" />
              ))}
            </Pie>
            <Tooltip contentStyle={tip} />
          </PieChart>
        </ResponsiveContainer>
        <div className={s.donutLabel}>
          {total}
          <small>세션</small>
        </div>
      </div>
      <div className={s.sessionLegend}>
        {values.map((v, i) => (
          <div key={v.name}>
            <i style={{ background: blue[i % 4] }} />
            <code>{v.name}</code>
            <span>
              {total ? Math.round((v.value / total) * 100) + '%' : '분모 0'}{' '}
              <small>· {v.value}</small>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
function percentileBucket(value: number | null) {
  return value === null
    ? undefined
    : value <= 1
      ? '1'
      : value <= 3
        ? '2–3'
        : value <= 7
          ? '4–7'
          : value <= 15
            ? '8–15'
            : '16+';
}
function Prompts({ points }: { points: Point[] }) {
  const buckets = points
    .filter((p) => !['p50', 'p90'].includes(String(p.key)))
    .map((p) => ({ name: p.key, value: number(p.value) }));
  const p50 = points.find((p) => p.key === 'p50'),
    p90 = points.find((p) => p.key === 'p90');
  return (
    <>
      <p className={s.percentiles}>
        ┃ 중앙값 {format(p50?.value)}　┊ p90 {format(p90?.value)}
      </p>
      <div className={s.histogram}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={buckets} margin={{ top: 18, left: 0, right: 0, bottom: 0 }}>
            <XAxis {...axis} dataKey="name" />
            <ReferenceLine
              x={percentileBucket(number(p50?.value))}
              stroke="var(--text-1)"
              strokeWidth={2}
            />
            <ReferenceLine
              x={percentileBucket(number(p90?.value))}
              stroke="var(--text-2)"
              strokeDasharray="3 3"
              strokeWidth={2}
            />
            <Tooltip contentStyle={tip} />
            <Bar
              dataKey="value"
              name="세션 수"
              fill="var(--accent-blue)"
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            >
              <LabelList dataKey="value" position="top" fill="var(--text-2)" fontSize={11} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
function Heatmap({ points }: { points: Point[] }) {
  const [selected, setSelected] = useState<string>('');
  return (
    <>
      <div className={s.heatmap} role="group" aria-label="요일별 24시간 프롬프트 수">
        {['월', '화', '수', '목', '금', '토', '일'].map((name, d) => (
          <div className={s.heatRow} key={name}>
            <span>{name}</span>
            {Array.from({ length: 24 }, (_, h) => {
              const p = points.find(
                (p) => p.labels.weekday === String(d + 1) && p.labels.hour === String(h),
              );
              const v = number(p?.value);
              const text = `${name}요일 ${h}시 KST · ${v === null ? '미관측' : v + ' 프롬프트'}`;
              return (
                <button
                  key={h}
                  aria-label={text}
                  title={text}
                  style={{
                    background:
                      v === null || v === 0
                        ? 'var(--surface-sub)'
                        : `var(--chart-heat${Math.min(5, Math.max(1, Math.ceil(v / 24)))})`,
                  }}
                  onClick={() => setSelected(text)}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className={s.hours}>
        <span>0h</span>
        <span>6h</span>
        <span>12h</span>
        <span>18h</span>
        <span>23h</span>
      </div>
      <div className={s.heatLegend} role="status">
        {selected || (
          <>
            적음{' '}
            {Array.from({ length: 5 }, (_, i) => (
              <i key={i} style={{ background: `var(--chart-heat${i + 1})` }} />
            ))}{' '}
            많음 · 셀 선택으로 값 확인
          </>
        )}
      </div>
    </>
  );
}
function Output({ results, retry }: { results: Record<string, QueryResult>; retry: () => void }) {
  const a = series(results.A),
    b = series(results.B),
    c = series(results.C);
  const failed = [a, b, c].some((x) => x.state === 'error');
  if (a.state !== 'success' && b.state !== 'success' && c.state !== 'success')
    return <WidgetState status={a.state} onRetry={retry} />;
  const points = [...a.points, ...b.points, ...c.points];
  if (points.some((p) => p.value.state === 'masked')) return <WidgetState status="masked" />;
  const rows = timeline(points).map((row) => ({
    ...row,
    removed: typeof row.removed === 'number' ? -row.removed : null,
  }));
  return (
    <>
      {failed && (
        <div className={s.partial} role="alert">
          일부 산출 지표 조회 실패 <Button onClick={retry}>재시도</Button>
        </div>
      )}
      <div className={s.outputChart}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            stackOffset="sign"
            data={rows}
            margin={{ top: 8, left: 0, right: 0, bottom: 0 }}
          >
            <defs>
              <pattern id="output-stripes" patternUnits="userSpaceOnUse" width="640" height="360">
                <image href="/assets/output-stripes.svg" width="640" height="360" />
              </pattern>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border-default)" />
            <XAxis
              {...axis}
              dataKey="time"
              tickFormatter={(v) => shortDate(Number(v))}
              minTickGap={10}
            />
            <YAxis
              {...axis}
              yAxisId="loc"
              width={40}
              tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${v / 1000}k` : v)}
            />
            <YAxis
              {...axis}
              yAxisId="count"
              orientation="right"
              width={30}
              domain={[0, 60]}
              ticks={[0, 30, 60]}
            />
            <YAxis yAxisId="pr" hide domain={[0, 15]} />
            <Tooltip contentStyle={tip} labelFormatter={(v) => shortDate(Number(v))} />
            <ReferenceLine yAxisId="loc" y={0} stroke="var(--text-3)" />
            <Bar
              yAxisId="loc"
              dataKey="added"
              name="LoC 추가"
              fill="var(--accent-green)"
              stackId="loc"
              maxBarSize={40}
              isAnimationActive={false}
            />
            <Bar
              yAxisId="loc"
              dataKey="removed"
              name="LoC 삭제"
              fill="url(#output-stripes)"
              stackId="loc"
              maxBarSize={40}
              isAnimationActive={false}
            />
            <Line
              yAxisId="count"
              dataKey="commits"
              name="커밋"
              stroke="var(--accent-green)"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              yAxisId="pr"
              dataKey="pull_requests"
              name="PR"
              stroke="var(--accent-green)"
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <DataTable points={points} title="산출" />
    </>
  );
}
function CostRow({
  title,
  dim,
  result,
  retry,
}: {
  title: string;
  dim: string;
  result?: QueryResult;
  retry: () => void;
}) {
  return (
    <div className={s.costRow}>
      <div className={s.costHeading}>
        {title}
        <code>{dim}</code>
      </div>
      <Result result={result} title={title} retry={retry}>
        {(points) => {
          const total = points.reduce((n, p) => n + (number(p.value) || 0), 0);
          return (
            <>
              <div className={s.stacked}>
                {points.map((p, i) => {
                  const value = number(p.value);
                  return (
                    <span
                      key={i}
                      style={{ flex: value || 0, background: violet[i % 4] }}
                      title={`${p.labels[dim]} ${format(p.value, 'USD')}`}
                    >
                      {total && value && value / total >= 0.08
                        ? Math.round((value / total) * 100) + '%'
                        : ''}
                    </span>
                  );
                })}
              </div>
              <div className={s.costLegend}>
                {points.map((p, i) => (
                  <span key={i}>
                    <i style={{ background: violet[i % 4] }} />
                    {p.labels[dim] === '__other__' ? '기타' : p.labels[dim]}{' '}
                    {format(p.value, 'USD')}
                  </span>
                ))}
              </div>
            </>
          );
        }}
      </Result>
    </div>
  );
}
function Stat({
  result,
  label,
  caption,
  color,
  retry,
}: {
  result?: QueryResult;
  label: string;
  caption: string;
  color: string;
  retry: () => void;
}) {
  return (
    <aside className={s.stat}>
      <p>{label}</p>
      <Result result={result} title={label} retry={retry}>
        {(points) => (
          <>
            <strong style={{ color }}>
              {format(points[0]?.value, 'ratio')}
              {number(points[0]?.value) !== null ? '%' : ''}
            </strong>
            <code>{caption}</code>
          </>
        )}
      </Result>
    </aside>
  );
}
export function Teams() {
  const { value, options, update } = useScopedFilters();
  const selected = value.filters?.team_ids || [];
  const coverage = useWidget('coverage', [q('telemetry_coverage')]);
  const masked = series(coverage.query.data?.results.A).state === 'masked';
  return (
    <section className={s.page} aria-label="팀 분석 대시보드">
      <header className={s.title} ref={coverage.ref}>
        <h1>팀 분석</h1>
        <div className={s.teamPicker} role="group" aria-label="분석 팀">
          <button
            aria-pressed={!selected.length}
            disabled={!options.data}
            onClick={() => update({ filters: { ...value.filters, team_ids: [] } })}
          >
            전체
          </button>
          {options.data?.teams?.map((t) => (
            <button
              key={t.team_id}
              aria-pressed={selected.includes(t.team_id!)}
              onClick={() => update({ filters: { ...value.filters, team_ids: [t.team_id!] } })}
            >
              {t.name}
            </button>
          ))}
        </div>
        <Badge>
          팀 활성 인원{' '}
          {masked ? 'n<5' : `${coverage.query.data?.coverage?.active_members ?? '—'}명`}
        </Badge>
        <p>
          {day(coverage.query.data?.resolved_from)} ~ {day(coverage.query.data?.resolved_to)}　
          {value.price_basis === 'contract' ? '계약' : '공시'} 단가 · 개인 이름·순위 없음
        </p>
      </header>
      {masked ? (
        <div className={s.maskedPage} role="status">
          <Badge>n&lt;5</Badge>
          <h2>이 팀은 활성 인원이 5명 미만이라 집계를 표시하지 않습니다</h2>
          <p>
            최소 집계 단위(5명) 미만 그룹은 개인이 추정될 수 있어 모든 지표를 마스킹합니다. 활성
            인원 n&lt;5 · 관측 기간 {day(coverage.query.data?.resolved_from)} ~{' '}
            {day(coverage.query.data?.resolved_to)}.
          </p>
          <Button onClick={() => update({ filters: { ...value.filters, team_ids: [] } })}>
            접근 가능한 전체 팀으로 보기
          </Button>
          <details>
            <summary>마스킹 정책 안내</summary>
            <p>
              5명 미만 그룹의 수치·비율·그래프·비교값을 표시하지 않습니다. 미관측은 미사용을
              의미하지 않습니다. 부서 계층은 현재 API에서 제공하지 않습니다.
            </p>
          </details>
        </div>
      ) : coverage.query.isPending ? (
        <WidgetState status="loading" />
      ) : coverage.query.isError && !coverage.query.data ? (
        <WidgetState status="error" onRetry={() => coverage.query.refetch()} />
      ) : (
        <>
          <div className={s.kpis}>
            {kpis.map((spec) => (
              <Kpi key={spec.metric} spec={spec} />
            ))}
          </div>
          <div className={s.grid}>
            <Widget
              id="sessions"
              title="세션 시작 유형"
              subtitle="세션 수 비중"
              definition="start_type별 세션 수입니다."
              caption="fresh = 새 세션 · resume/continue = 이어하기 · agents_view = 에이전트 뷰 진입"
              queries={[q('sessions', 'table', { group_by: ['start_type'] })]}
            >
              {(r, retry) => (
                <Result result={r.A} title="세션 시작 유형" retry={retry}>
                  {(p) => <Sessions points={p} />}
                </Result>
              )}
            </Widget>
            <Widget
              id="prompts"
              title="세션당 프롬프트 수"
              subtitle="분포 · 세션 단위"
              definition="세션별 프롬프트 수의 버킷 분포와 p50/p90입니다."
              caption="x = 세션당 프롬프트 버킷 · y = 세션 수 · 개인 축 없음"
              queries={[q('prompts_per_session', 'distribution')]}
            >
              {(r, retry) => (
                <Result result={r.A} title="세션당 프롬프트 수" retry={retry}>
                  {(p) => <Prompts points={p} />}
                </Result>
              )}
            </Widget>
            <Widget
              id="heatmap"
              title="시간대 × 요일"
              subtitle="프롬프트 수 · KST"
              definition="KST 시간과 요일별 프롬프트 합계입니다. 개인 축은 제공하지 않습니다."
              caption="팀 합산만 · 미관측 ≠ 미사용"
              queries={[q('usage_heatmap', 'table', { group_by: ['weekday', 'hour'] })]}
            >
              {(r, retry) => (
                <Result result={r.A} title="시간대 × 요일" retry={retry}>
                  {(p) => <Heatmap points={p} />}
                </Result>
              )}
            </Widget>
            <Widget
              id="output"
              title="산출"
              subtitle="주 단위 · 종료일 기준 완료된 최근 8주"
              definition="AI 관여 LoC는 도구 편집 diff, 커밋과 PR은 훅 이벤트 기준입니다."
              caption="AI 관여 LoC = 도구 편집 diff · 커밋/PR은 훅 이벤트 기준(미관측 ≠ 미사용)"
              size="large"
              recentWeeks
              queries={[
                q('lines_of_code', 'timeseries', { group_by: ['type'], interval: '1w' }),
                q('commits', 'timeseries', { ref_id: 'B', interval: '1w' }),
                q('pull_requests', 'timeseries', { ref_id: 'C', interval: '1w' }),
              ]}
            >
              {(results, retry) => <Output results={results} retry={retry} />}
            </Widget>
            <Widget
              id="cost"
              title="비용 귀속"
              subtitle={`${value.price_basis === 'contract' ? '계약' : '공시'} · 100% 누적`}
              definition="모델, 쿼리 출처, 에이전트, MCP 서버별 비용 비중입니다. 각 행은 별도 분해입니다."
              caption={`청구액 아님(${value.price_basis === 'contract' ? '계약' : '공시'} 단가 추정) · 팀 합계`}
              size="large"
              queries={['model', 'query_source', 'agent_name', 'mcp_server']
                .map((dim, i) =>
                  q('cost', 'table', {
                    ref_id: String.fromCharCode(65 + i),
                    group_by: [dim as NonNullable<Query['group_by']>[number]],
                    source: 'metrics',
                  }),
                )
                .concat(q('subagent_cost_ratio', 'scalar', { ref_id: 'E' }))}
            >
              {(r, retry) => (
                <div className={s.split}>
                  <div>
                    {['모델별', '쿼리 출처별', '에이전트별', 'MCP 서버별'].map((title, i) => (
                      <CostRow
                        key={title}
                        title={title}
                        dim={['model', 'query_source', 'agent_name', 'mcp_server'][i]}
                        result={r[String.fromCharCode(65 + i)]}
                        retry={retry}
                      />
                    ))}
                  </div>
                  <Stat
                    result={r.E}
                    label="서브에이전트 비용 비율"
                    caption="query_source=subagent ÷ 전체"
                    color="var(--accent-purple)"
                    retry={retry}
                  />
                </div>
              )}
            </Widget>
            <Widget
              id="tokens"
              title="토큰 구성"
              subtitle="일 단위 · 누적"
              definition="input/output/cache_read/cache_create 토큰을 일 단위로 합산합니다."
              caption="단위 M 토큰 · 캐시 생성은 비용 가중치가 다름(비용은 비용 귀속 참조)"
              size="medium"
              queries={[
                q('tokens', 'timeseries', { group_by: ['type'], interval: '1d', source: 'events' }),
                q('cache_read_ratio', 'scalar', { ref_id: 'B' }),
              ]}
            >
              {(r, retry) => (
                <>
                  <div className={s.split}>
                    <div>
                      <Result result={r.A} title="토큰 구성" retry={retry}>
                        {(points) => (
                          <div className={s.tokenChart}>
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart
                                data={timeline(points)}
                                margin={{ top: 5, left: 0, right: 0, bottom: 0 }}
                              >
                                <XAxis
                                  {...axis}
                                  dataKey="time"
                                  tickFormatter={(v) => shortDate(Number(v))}
                                  minTickGap={20}
                                />
                                <YAxis
                                  {...axis}
                                  width={38}
                                  tickFormatter={(v) => `${v / 1000000}M`}
                                />
                                <CartesianGrid
                                  vertical={false}
                                  stroke="var(--border-default)"
                                  strokeDasharray="4 3"
                                />
                                <Tooltip
                                  contentStyle={tip}
                                  labelFormatter={(v) => shortDate(Number(v))}
                                />
                                {['input', 'output', 'cache_read', 'cache_create'].map((key, i) => (
                                  <Area
                                    key={key}
                                    dataKey={key}
                                    stackId="tokens"
                                    fillOpacity={0.9}
                                    stroke="var(--surface-card)"
                                    fill={tokenColors[i]}
                                    isAnimationActive={false}
                                  />
                                ))}
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </Result>
                    </div>
                    <Stat
                      result={r.B}
                      label="캐시 읽기 비율"
                      caption="cacheRead ÷ (input+cacheRead+cacheCreation)"
                      color="var(--accent-blue)"
                      retry={retry}
                    />
                  </div>
                </>
              )}
            </Widget>
            <TeamDetails />
          </div>
        </>
      )}
    </section>
  );
}
