import { useState, type ReactNode } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useWidget } from '../../widgets/useWidget';
import { useAuth } from '../../app/auth';
import { useScopedFilters } from '../../app/filterContext';
import { Widget, Result, q, axis, tip, Legend, shortDate } from '../../widgets/Widget';
import { format, number, timeline } from '../../widgets/model';
import type { QueryRequest, QueryResult } from '../../api/types';
import { adaptResult } from '../../api/frames';
import { opsApi, maskedEmail } from '../../api/operations';
import { Badge, Button, WidgetCard, WidgetState } from '../../components/ui';
import { State, Table, Pager, dateTime, FrameTable } from './shared';
import { PolicyCard } from '../settings/Settings';
import { Hooks } from './Hooks';
import { SessionSearch } from './SessionSearch';
import s from './Operations.module.css';
const red = 'var(--accent-red)',
  blue = 'var(--accent-blue)',
  orange = 'var(--accent-orange)';
const colors = [blue, 'var(--chart-seq2)', 'var(--chart-seq3)'];
const hour = (v: number) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit' }).format(
    new Date(v),
  ) + 'h';
export function Trend({
  id,
  title,
  metric,
  dimension = 'type',
  group,
  interval = '1h',
  recent = false,
  stack = false,
  color = blue,
  caption = '',
  params,
  aside,
}: {
  aside?: ReactNode;
  id: string;
  title: string;
  metric: QueryRequest['queries'][number]['metric_id'];
  dimension?: string;
  group?: QueryRequest['queries'][number]['group_by'];
  interval?: '1h' | '1d';
  recent?: boolean;
  stack?: boolean;
  color?: string;
  caption?: string;
  params?: Record<string, unknown>;
}) {
  const palette = (i: number) =>
    color === red
      ? ['var(--accent-red)', 'var(--accent-red2)', 'var(--accent-red3)'][i % 3]
      : color === orange
        ? orange
        : colors[i % colors.length];
  const legend =
    metric === 'api_error_rate'
      ? ['500', '429', '400']
      : metric === 'llm_duration_ms'
        ? ['p50', 'p95', 'p99']
        : metric === 'llm_ttft_ms'
          ? ['p50', 'p90']
          : metric === 'tool_rejections'
            ? ['config', 'hook']
            : ['재시도'];
  return (
    <Widget
      headerLegend={<Legend labels={legend} colors={legend.map((_, i) => palette(i))} />}
      id={`ops-${id}`}
      title={title}
      subtitle={metric}
      definition={caption || '시간 구간별 관측 지표입니다.'}
      caption={caption}
      queries={[q(metric, 'timeseries', { group_by: group, interval, params })]}
      requestPatch={recent ? { from: 'now-24h', to: 'now', compare: 'none' } : undefined}
    >
      {(data, retry) => (
        <Result result={data.A} title={title} retry={retry}>
          {(points) => {
            const ids = [...new Set(points.map((p) => p.labels[dimension] || 'value'))];
            const unit = points[0]?.unit;
            return (
              <>
                <div className={aside ? s.chartWithAside : undefined}>
                  <div className={s.chart}>
                    <ResponsiveContainer>
                      <ComposedChart
                        data={timeline(points, dimension)}
                        margin={{ top: 10, right: 8, bottom: 0, left: -10 }}
                      >
                        <CartesianGrid
                          vertical={false}
                          stroke="var(--border-default)"
                          strokeDasharray="3 3"
                        />
                        <XAxis
                          {...axis}
                          dataKey="time"
                          tickFormatter={interval === '1h' ? hour : shortDate}
                          minTickGap={40}
                        />
                        <YAxis
                          {...axis}
                          tickFormatter={(n) =>
                            unit === 'ratio'
                              ? `${(n * 100).toFixed(1)}%`
                              : n >= 1000
                                ? `${(n / 1000).toFixed(1)}k`
                                : String(n)
                          }
                        />
                        <Tooltip
                          contentStyle={tip}
                          labelFormatter={(v) => dateTime(new Date(Number(v)).toISOString())}
                        />
                        {ids.map((id, i) =>
                          stack ? (
                            <Area
                              key={id}
                              type="linear"
                              stackId="a"
                              dataKey={id}
                              stroke={palette(i)}
                              fill={palette(i)}
                              fillOpacity={0.8}
                              isAnimationActive={false}
                            />
                          ) : (
                            <Line
                              key={id}
                              type="linear"
                              dataKey={id}
                              stroke={palette(i)}
                              strokeDasharray={i ? '3 3' : undefined}
                              dot={false}
                              strokeWidth={1.6}
                              isAnimationActive={false}
                            />
                          ),
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  {aside}
                </div>
                <p className={s.caption}>
                  마지막 관측{' '}
                  {ids
                    .map((id) => {
                      const p = points
                        .filter((p) => (p.labels[dimension] || 'value') === id)
                        .at(-1);
                      return `${id} ${format(p?.value, p?.unit)}${p?.unit === 'ratio' ? '%' : p?.unit === 'ms' ? ' ms' : ''}`;
                    })
                    .join(' · ')}
                </p>
              </>
            );
          }}
        </Result>
      )}
    </Widget>
  );
}
function NamedTable({
  result,
  retry,
  columns,
}: {
  result?: QueryResult;
  retry: () => void;
  columns: Record<string, string>;
}) {
  const a = adaptResult(result);
  if (a.status !== 'success') return <WidgetState status={a.status} onRetry={retry} />;
  const rows = a.frames.flatMap((f) =>
    f.rows.map((r) => {
      const obj: Record<string, unknown> = {};
      f.fields.forEach((field, i) => {
        Object.assign(obj, field.labels);
        obj[field.name] =
          r[i].state === 'value' ? r[i].value : r[i].state === 'masked' ? 'n<5' : '미관측';
      });
      return Object.keys(columns).map((k) => {
        const v = obj[k];
        return typeof v === 'number' ? (
          k.includes('rate') || k.includes('ratio') ? (
            <span className={s.failureValue} style={{ color: v > 0.05 ? red : orange }}>
              {(v * 100).toFixed(1)}%
              {k === 'failure_rate' && (
                <span className={s.failureBar}>
                  <i
                    style={{
                      width: `${Math.min(1, v / 0.1) * 100}%`,
                      background: v > 0.05 ? red : orange,
                    }}
                  />
                  <b />
                </span>
              )}
            </span>
          ) : (
            v.toLocaleString('en-US')
          )
        ) : typeof v === 'string' ? (
          v
        ) : typeof v === 'boolean' ? (
          String(v)
        ) : (
          '—'
        );
      });
    }),
  );
  return <Table headers={Object.values(columns)} rows={rows} />;
}
function Stability() {
  return (
    <div className={s.grid}>
      <Trend
        id="errors"
        title="API 에러율"
        metric="api_error_rate"
        group={['status_code']}
        stack
        color={red}
        recent
        caption="최근 24h · 1h · 전체 API 시도 수 대비 상태 코드별 오류 비율"
      />
      <Trend
        id="latency"
        title="LLM 지연"
        metric="llm_duration_ms"
        recent
        caption="최근 24h · p50 / p95 / p99 · 밀리초"
      />
      <Trend
        id="ttft"
        title="TTFT"
        metric="llm_ttft_ms"
        dimension="percentile"
        recent
        caption="최근 24h · 첫 토큰까지 지연 p50 / p90 · 밀리초"
      />
      <Trend
        id="retries"
        title="재시도 요청 비율"
        metric="api_retry_attempts"
        recent
        color={orange}
        caption="최근 24h · attempt ≥ 2 ÷ API 호출 · 재시도 고갈은 미수집"
      />
      <div className={s.full}>
        <Widget
          id="ops-tools"
          title="도구별 실패율"
          subtitle="호출 상위 8"
          definition="실패 호출 ÷ 전체 호출. 5% 초과는 검토 대상입니다."
          caption="실패는 도구 마찰 신호입니다. 개인 평가에 사용하지 않습니다."
          queries={[q('tool_failure_rate', 'table', { group_by: ['tool_name'], limit: 8 })]}
        >
          {(d, r) => (
            <NamedTable
              result={d.A}
              retry={r}
              columns={{
                tool_name: 'tool_name',
                calls: '호출',
                failures: '실패',
                failure_rate: '실패율',
                top_error_type: '주요 error_type',
              }}
            />
          )}
        </Widget>
      </div>
    </div>
  );
}
function InstallationsCard() {
  const scope = useScopedFilters();
  const [days, setDays] = useState(''),
    [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1) || '';
  const params = new URLSearchParams({
    limit: '8',
    cursor,
    ...(days ? { inactive_days: days } : {}),
    ...(scope.value.filters?.team_ids?.[0] ? { team_id: scope.value.filters?.team_ids[0] } : {}),
  });
  const query = useQuery({
    queryKey: ['ops-installations', scope.role, params.toString()],
    queryFn: ({ signal }) => opsApi.installations(params, signal),
  });
  return (
    <WidgetCard
      title="설치 커버리지"
      action={
        <div className={s.inline}>
          <span>무활동</span>
          {['30', '60', '90', ''].map((v) => (
            <Button
              key={v}
              size={26}
              aria-pressed={v === days}
              onClick={() => {
                setDays(v);
                setCursors([]);
              }}
            >
              {v ? `${v}일` : '전체'}
            </Button>
          ))}
        </div>
      }
      caption="이메일은 도메인만 표시 · 마지막 이벤트 기준 무활동 · 미관측 ≠ 미사용"
    >
      <State query={query}>
        {(d) => (
          <>
            <Table
              headers={['구성원', '팀', '플랫폼', '클라이언트 버전', '마지막 관측', '상태']}
              rows={(d.items || []).map((i) => [
                <code>{maskedEmail(i.member_email_masked)}</code>,
                i.team_ids
                  ?.map(
                    (id) => scope.options.data?.teams?.find((t) => t.team_id === id)?.name || id,
                  )
                  .join(', '),
                i.platform,
                i.client_version,
                dateTime(i.last_event_at),
                <Badge>{i.status}</Badge>,
              ])}
            />
            <div className={s.inline}>
              <small>
                {d.total ?? '—'}개 중 {d.items?.length ?? 0}개 표시
              </small>
              <Pager
                hasNext={!!d.next_cursor}
                hasPrevious={!!cursors.length}
                next={() => setCursors([...cursors, d.next_cursor!])}
                previous={() => setCursors(cursors.slice(0, -1))}
              />
            </div>
          </>
        )}
      </State>
    </WidgetCard>
  );
}
function Compliance() {
  const scope = useScopedFilters();
  return (
    <div className={s.grid}>
      <div className={s.wide}>
        <InstallationsCard key={scope.serialized} />
      </div>
      <div className={s.narrow}>
        <Widget
          id="ops-coverage"
          title="텔레메트리 커버리지"
          subtitle="활성 설치 / 구성원"
          definition="설치 수 ÷ 구성원 수"
          caption="미관측은 미사용을 의미하지 않습니다."
          queries={[q('telemetry_coverage')]}
        >
          {(d, r) => (
            <Result result={d.A} title="커버리지" retry={r}>
              {(p) => (
                <>
                  <strong className={s.stat} style={{ color: blue }}>
                    {format(p[0]?.value, 'ratio')}%
                  </strong>
                  <progress max={1} value={number(p[0]?.value) ?? 0} />
                </>
              )}
            </Result>
          )}
        </Widget>
      </div>
      <Hooks />
      <PolicyCard compact />
      <div className={s.full}>
        <Widget
          id="ops-mcp"
          title="MCP 인벤토리"
          subtitle="서버 · scope · transport"
          definition="기간 내 관측된 MCP 연결입니다."
          caption="레지스트리 출처/third-party 여부는 API 미제공 · 임의 위반 판정 없음"
          queries={[
            q('mcp_connections', 'table', {
              group_by: ['server_name', 'server_scope', 'transport_type', 'is_plugin'],
            }),
          ]}
        >
          {(d, r) => (
            <NamedTable
              result={d.A}
              retry={r}
              columns={{
                server_name: '서버',
                server_scope: 'scope',
                transport_type: 'transport',
                is_plugin: 'is_plugin',
                connections: '연결',
                sessions: '세션',
              }}
            />
          )}
        </Widget>
      </div>
    </div>
  );
}
function RubberStamp() {
  const { ref, query } = useWidget('ops-rubber', [
    q('rubber_stamp_ratio', 'scalar', { params: { threshold_ms: 2000 } }),
  ]);
  return (
    <aside ref={ref} className={s.rubber}>
      <small>러버스탬프 비율</small>
      {query.isPending ? (
        <WidgetState status="loading" />
      ) : query.isError ? (
        <WidgetState status="error" onRetry={() => query.refetch()} />
      ) : (
        <Result result={query.data.results.A} title="러버스탬프" retry={() => query.refetch()}>
          {(p) => (
            <strong className={s.stat} style={{ color: orange }}>
              {format(p.find((p) => p.unit === 'ratio')?.value, 'ratio')}%
            </strong>
          )}
        </Result>
      )}
      <small>2초 미만 사람 수락 ÷ 사람 수락</small>
    </aside>
  );
}
function RateLimits() {
  return (
    <Widget
      id="ops-rate-limits"
      title="429 타임라인"
      subtitle="선택 기간 · 시간축 공유"
      definition="모델별 429 이벤트 수 · 원 크기는 오류 건수"
      caption="모델별 행 · 빨강은 429 오류 · 개인 분해 없음"
      queries={[q('rate_limit_events', 'timeseries', { group_by: ['model'], interval: '1h' })]}
    >
      {(d, r) => (
        <Result result={d.A} title="429 타임라인" retry={r}>
          {(points) => {
            const times = points.map((p) => Number(p.key)),
              start = Math.min(...times),
              duration = Math.max(1, Math.max(...times) - start);
            return (
              <>
                <div className={s.scatter}>
                  {[...new Set(points.map((p) => p.labels.model))].map((model) => (
                    <div className={s.scatterRow} key={model}>
                      <code>{model}</code>
                      <div>
                        {points
                          .filter((p) => p.labels.model === model && (number(p.value) || 0) > 0)
                          .map((p, i) => (
                            <button
                              key={i}
                              title={`${model} · ${dateTime(new Date(Number(p.key)).toISOString())} · ${format(p.value)}건`}
                              aria-label={`${model} ${shortDate(Number(p.key))} ${hour(Number(p.key))} ${format(p.value)}건`}
                              style={{
                                left: `${((Number(p.key) - start) / duration) * 96 + 2}%`,
                                width: Math.max(
                                  6,
                                  Math.min(22, Math.sqrt(number(p.value) || 0) * 5),
                                ),
                                height: Math.max(
                                  6,
                                  Math.min(22, Math.sqrt(number(p.value) || 0) * 5),
                                ),
                              }}
                            />
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className={s.scatterAxis}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <small key={i}>{shortDate(start + (duration * i) / 4)}</small>
                  ))}
                </div>
                <p className={s.caption}>
                  합계{' '}
                  <span style={{ color: red }}>
                    {points.reduce((sum, p) => sum + (number(p.value) || 0), 0)}건
                  </span>
                </p>
              </>
            );
          }}
        </Result>
      )}
    </Widget>
  );
}
function Security({ onSession }: { onSession: () => void }) {
  const scope = useScopedFilters();
  return (
    <div className={s.grid}>
      <Widget
        id="ops-refusals"
        title="안전 거부 카테고리"
        subtitle="전사 단위 고정"
        definition="안전 거부는 개인·팀으로 분해하지 않습니다."
        caption="개인·팀으로 내려가지 않음 · 세션 단위 조회는 사유 필수"
        requestPatch={{ filters: { ...scope.value.filters, team_ids: [], member_ids: [] } }}
        queries={[q('refusals', 'table', { group_by: ['category'] })]}
      >
        {(d, r) => (
          <Result result={d.A} title="안전 거부" retry={r}>
            {(p) => (
              <>
                <strong className={s.stat} style={{ color: red }}>
                  {p.reduce((n, v) => n + (number(v.value) || 0), 0)}
                  <small> 건</small>
                </strong>
                {p.map((v, i) => (
                  <div className={s.barRow} key={i}>
                    <code>{v.key}</code>
                    <div>
                      <i
                        style={{
                          width: `${((number(v.value) || 0) / Math.max(1, ...p.map((v) => number(v.value) || 0))) * 100}%`,
                          background: red,
                        }}
                      />
                    </div>
                    <span>{format(v.value)}</span>
                  </div>
                ))}
              </>
            )}
          </Result>
        )}
      </Widget>
      <RateLimits />

      <Widget
        id="ops-mismatch"
        title="벤더 계정 불일치"
        subtitle="정책 위반 후보"
        definition="등록 계정과 벤더 계정의 불일치. 정책 위반 확정이 아닙니다."
        caption="이메일은 도메인만 표시 · 전체 식별 조회에는 사유가 필요합니다."
        queries={[q('vendor_account_mismatch', 'table')]}
        controls={
          <Button size={26} onClick={onSession}>
            세션 조회로 →
          </Button>
        }
      >
        {(d, r) => (
          <FrameTable
            result={d.A}
            retry={r}
            columns={{
              installation_id: '설치',
              registered_email: '등록 이메일 도메인',
              vendor_email: '벤더 이메일 도메인',
              last_seen_at: '마지막 관측',
            }}
          />
        )}
      </Widget>
      <Trend
        id="policy"
        title="정책 거절 추이"
        metric="tool_rejections"
        group={['decided_by']}
        interval="1d"
        color={orange}
        params={{ decided_by: ['config', 'hook'] }}
        caption="거절은 정책 동작 · 러버스탬프는 마찰 신호이며 개인 평가 금지"
        aside={<RubberStamp />}
      />
    </div>
  );
}
export function Operations() {
  const { profile } = useAuth();
  const [tab, setTab] = useState('stability');
  const scope = useScopedFilters();
  const location = useLocation();
  if (profile?.role !== 'owner')
    return (
      <>
        <h1>접근 권한이 없습니다</h1>
        <p>운영 · 보안은 owner 권한으로 제공됩니다.</p>
      </>
    );
  return (
    <div className={s.page}>
      <Tabs.Root value={tab} onValueChange={setTab}>
        <header className={s.title}>
          <h1>운영 · 보안</h1>
          <Tabs.List aria-label="운영·보안 탭" className={s.tabs}>
            {[
              ['stability', '서비스 안정성'],
              ['compliance', '컴플라이언스'],
              ['security', '보안'],
              ['sessions', '세션 조회(감사)'],
            ].map(([v, l]) => (
              <Tabs.Trigger key={v} value={v}>
                {l}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <small>
            {tab === 'stability'
              ? '최근 24h · 1h 간격'
              : tab === 'security'
                ? '안전 거부는 전사 단위 · 개인 분해 없음'
                : tab === 'sessions'
                  ? 'owner 전용 · 사유 없이 결과 없음'
                  : '설치·훅·MCP·manifest'}
          </small>
        </header>
        <Tabs.Content value="stability">
          <Stability />
        </Tabs.Content>
        <Tabs.Content value="compliance">
          <Compliance />
        </Tabs.Content>
        <Tabs.Content value="security">
          <Security onSession={() => setTab('sessions')} />
        </Tabs.Content>
        <Tabs.Content value="sessions">
          <SessionSearch key={scope.serialized + location.pathname} />
        </Tabs.Content>
      </Tabs.Root>
      <p className={s.caption}>
        <Link to={'/settings?' + scope.serialized + '#policy'}>설정 › 수집 정책</Link>
      </p>
    </div>
  );
}
