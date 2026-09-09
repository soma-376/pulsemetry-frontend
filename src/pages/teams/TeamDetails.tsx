import { useState, type ReactNode } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Bar,
  Line,
} from 'recharts';
import { Badge, WidgetState } from '../../components/ui';
import { adaptResult, type Cell } from '../../api/frames';
import type { QueryResult } from '../../api/types';
import { number, format, series, timeline } from '../../widgets/model';
import { useScopedFilters } from '../../app/filterContext';
import { Widget, Result, DataTable, q, axis, tip, shortDate } from '../../widgets/Widget';
import s from './TeamDetails.module.css';
type Row = { labels: Record<string, string>; cells: Record<string, Cell> };
export function detailRows(result?: QueryResult): Row[] {
  return adaptResult(result).frames.flatMap((f) =>
    f.rows.map((row) => ({
      labels: Object.assign({}, ...f.fields.map((f) => f.labels)),
      cells: Object.fromEntries(f.fields.map((f, i) => [f.name, row[i]])),
    })),
  );
}
function text(c?: Cell, ratio = false) {
  return c?.state === 'masked'
    ? 'n<5'
    : c?.state === 'missing'
      ? '—'
      : format(c, ratio ? 'ratio' : undefined) + (ratio && number(c) !== null ? '%' : '');
}
function Rows({
  result,
  retry,
  children,
  allowMaskedRows = false,
}: {
  allowMaskedRows?: boolean;
  result?: QueryResult;
  retry: () => void;
  children: (rows: Row[]) => ReactNode;
}) {
  const model = adaptResult(result);
  if (model.status !== 'success') return <WidgetState status={model.status} onRetry={retry} />;
  const rows = detailRows(result);
  if (
    allowMaskedRows
      ? rows.every((r) => Object.values(r.cells).every((c) => c.state === 'masked'))
      : rows.some((r) => Object.values(r.cells).some((c) => c.state === 'masked'))
  )
    return <WidgetState status="masked" />;
  return (
    <>
      {children(rows)}
      <DataTable points={series(result).points} title="상세" />
    </>
  );
}
function Meter({
  value,
  max = 1,
  color = 'var(--accent-orange)',
}: {
  value: number | null;
  max?: number;
  color?: string;
}) {
  return (
    <span className={s.track} aria-hidden="true">
      {value !== null && (
        <span
          style={{
            width: `${Math.min(100, Math.max(0, (value / max) * 100))}%`,
            background: color,
          }}
        />
      )}
    </span>
  );
}
function Bars({
  rows,
  field,
  dimension,
  ratio = false,
  max,
  color,
}: {
  rows: Row[];
  field: string;
  dimension: string;
  ratio?: boolean;
  max?: number;
  color?: string;
}) {
  const maximum = max || Math.max(1, ...rows.map((r) => number(r.cells[field]) || 0));
  return (
    <div className={s.bars}>
      {rows.map((r, i) => (
        <div key={i}>
          <code>{r.labels[dimension] || '미분류'}</code>
          <Meter value={number(r.cells[field])} max={maximum} color={color} />
          <span>{text(r.cells[field], ratio)}</span>
        </div>
      ))}
    </div>
  );
}
const frictionTabs = ['언어별 수락률', '자동 승인 비율', '권한 대기 시간', '거절 출처'];
const definitions = [
  '수락률 = 사용자 직접 수락 ÷ 사용자 직접 결정 · 자동 승인 제외 · 수락률은 KPI가 아님',
  'decided_by=config: settings 허용 규칙 · hook: PreToolUse 훅 자동 승인 · 두 값은 겹치지 않음',
  'gate_wait_ms = 권한 프롬프트 표시 → 결정까지 · 사람 결정만 · p50/p90만 공개(평균 없음)',
  '거절 = 도구 호출이 실행되지 않은 결정 · 출처(decided_by)별 분리 · 개인 축 없음',
];
const waitMaximum = (rows: Row[]) =>
  Math.max(60000, ...rows.map((r) => Math.ceil((number(r.cells.p90) || 0) / 15000) * 15000));
function Friction() {
  const [tab, setTab] = useState('0');
  const queries = [
    q('edit_acceptance_rate', 'table', { group_by: ['language'] }),
    q('auto_approval_ratio', 'table', { group_by: ['decided_by'] }),
    q('gate_wait_ms', 'distribution', { group_by: ['decision'] }),
    q('tool_rejections', 'table', { group_by: ['tool_name', 'decided_by'], limit: 5 }),
  ];
  return (
    <Tabs.Root value={tab} onValueChange={setTab} asChild>
      <div className={s.friction}>
        <Widget
          id={'friction-' + tab}
          title="마찰"
          subtitle=""
          definition={definitions[+tab]}
          caption={definitions[+tab]}
          size="medium"
          controls={
            <Tabs.List aria-label="마찰 지표" className={s.tabs}>
              {frictionTabs.map((name, i) => (
                <Tabs.Trigger key={name} value={String(i)}>
                  {name}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
          }
          queries={[queries[+tab]]}
        >
          {(r, retry) => (
            <>
              <Tabs.Content value={tab} className={s.tabContent}>
                <Rows result={r.A} retry={retry} allowMaskedRows={tab === '0'}>
                  {(rows) =>
                    tab === '0' ? (
                      <div className={s.tableScroll}>
                        <table className={s.acceptance}>
                          <thead>
                            <tr>
                              <th>언어</th>
                              <th>수락률</th>
                              <th aria-label="수락률 막대" />
                              <th>사람 결정 건수</th>
                              <th>자동 승인(제외)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r, i) => (
                              <tr key={i}>
                                <td>
                                  <code>{r.labels.language}</code>
                                </td>
                                <td>{text(r.cells.acceptance_rate, true)}</td>
                                <td>
                                  <Meter value={number(r.cells.acceptance_rate)} />
                                </td>
                                <td>{text(r.cells.decisions)}</td>
                                <td>{text(r.cells.auto_approved)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : tab === '1' ? (
                      <>
                        <div className={s.largeNumber}>
                          {(
                            rows.reduce((v, r) => v + (number(r.cells.ratio) || 0), 0) * 100
                          ).toFixed(1)}
                          %
                        </div>
                        <p className={s.muted}>
                          자동 승인 비율 · 전체 권한 요청 {text(rows[0]?.cells.denominator)}건 중{' '}
                          {rows
                            .reduce((v, r) => v + (number(r.cells.numerator) || 0), 0)
                            .toLocaleString()}
                          건
                        </p>
                        <Bars rows={rows} dimension="decided_by" field="ratio" ratio max={0.3} />
                        <div className={s.scale}>
                          <span>0%</span>
                          <span>10%</span>
                          <span>20%</span>
                          <span>30%</span>
                        </div>
                      </>
                    ) : tab === '2' ? (
                      <>
                        <p className={s.muted}>박스 = p50 → p90 · 평균 표시 안 함</p>
                        {rows.map((r, i) => {
                          const p50 = number(r.cells.p50),
                            p90 = number(r.cells.p90);
                          return (
                            <div className={s.wait} key={i}>
                              <div>
                                <code>{r.labels.decision}</code>
                                <span>
                                  p50 {p50 === null ? text(r.cells.p50) : p50 / 1000 + 's'}　 p90{' '}
                                  {p90 === null ? text(r.cells.p90) : p90 / 1000 + 's'}　 n=
                                  {text(r.cells.count)}
                                </span>
                              </div>
                              <div className={s.waitTrack} data-decision={r.labels.decision}>
                                {p50 !== null && p90 !== null && (
                                  <span
                                    style={{
                                      left: `${(p50 / waitMaximum(rows)) * 100}%`,
                                      width: `${(Math.max(0, p90 - p50) / waitMaximum(rows)) * 100}%`,
                                    }}
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })}
                        <div className={s.scale}>
                          {[0, 1, 2, 3, 4].map((i) => (
                            <span key={i}>{(waitMaximum(rows) * i) / 4000}s</span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <p className={s.muted}>
                          user · config · hook　　tool_name 상위 5 · 거절 건수
                        </p>
                        <div className={s.rejections}>
                          {[...new Set(rows.map((r) => r.labels.tool_name))].map((name) => {
                            const group = rows.filter((r) => r.labels.tool_name === name),
                              total = group.reduce(
                                (v, r) => v + (number(r.cells.rejections) || 0),
                                0,
                              );
                            return (
                              <div key={name}>
                                <code>{name}</code>
                                <div className={s.stack}>
                                  {group.map((r, i) => (
                                    <span
                                      key={i}
                                      title={`${r.labels.decided_by}: ${text(r.cells.rejections)}`}
                                      style={{
                                        width: `${((number(r.cells.rejections) || 0) / Math.max(1, ...rows.map((r) => rows.filter((x) => x.labels.tool_name === r.labels.tool_name).reduce((v, x) => v + (number(x.cells.rejections) || 0), 0)))) * 100}%`,
                                        background: [
                                          'var(--accent-orange)',
                                          'var(--accent-orange-tint)',
                                          'var(--accent-gray)',
                                        ][i],
                                      }}
                                    />
                                  ))}
                                </div>
                                <span>{total}</span>
                              </div>
                            );
                          })}
                        </div>
                        <details className={s.sourceTable}>
                          <summary>출처별 건수</summary>
                          <table>
                            <tbody>
                              {rows.map((r, i) => (
                                <tr key={i}>
                                  <td>{r.labels.tool_name}</td>
                                  <td>{r.labels.decided_by}</td>
                                  <td>{text(r.cells.rejections)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </details>
                      </>
                    )
                  }
                </Rows>
              </Tabs.Content>
            </>
          )}
        </Widget>
      </div>
    </Tabs.Root>
  );
}
function Features() {
  return (
    <Widget
      id="features"
      title="기능 채택"
      subtitle=""
      definition="MCP 연결과 명령 프롬프트 비중 및 도구 액션 분포입니다."
      caption="MCP 실패율 = 연결 실패 ÷ 연결 시도 · 도구 액션 = tool_name을 7개 액션으로 정규화"
      size="wide"
      queries={[
        q('mcp_connections', 'table', {
          group_by: ['server_name', 'server_scope', 'transport_type'],
        }),
        q('command_prompt_ratio', 'scalar', { ref_id: 'B' }),
        q('tool_calls', 'table', { ref_id: 'C', group_by: ['action'] }),
      ]}
    >
      {(r, retry) => (
        <div className={s.features}>
          <div>
            <h3>MCP 서버</h3>
            <Rows result={r.A} retry={retry}>
              {(rows) => (
                <div className={s.tableScroll}>
                  <table>
                    <thead>
                      <tr>
                        <th>서버명</th>
                        <th>scope</th>
                        <th>transport</th>
                        <th>연결 수</th>
                        <th>실패율</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i}>
                          <td>
                            <code>{r.labels.server_name}</code>
                          </td>
                          <td>
                            <span className={s.scope}>{r.labels.server_scope}</span>
                          </td>
                          <td>
                            <code>{r.labels.transport_type}</code>
                          </td>
                          <td>{text(r.cells.connections)}</td>
                          <td
                            style={{
                              color:
                                (number(r.cells.failure_ratio) || 0) > 0.03
                                  ? 'var(--accent-orange)'
                                  : undefined,
                            }}
                          >
                            {text(r.cells.failure_ratio, true)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Rows>
            <div className={s.unavailable}>
              {[
                ['스킬', 'skill.invoked 신호 미수집'],
                ['플러그인', 'plugin.* 속성 미정규화'],
              ].map(([name, cause]) => (
                <div key={name}>
                  <span>{name}</span>
                  <Badge>준비 중</Badge>
                  <p>어댑터 확장 필요 · {cause}</p>
                </div>
              ))}
            </div>
          </div>
          <div className={s.featureAside}>
            <h3>커맨드 프롬프트 비중</h3>
            <Result result={r.B} title="커맨드 프롬프트 비중" retry={retry}>
              {(p) => (
                <div className={s.command}>
                  <strong>{text(p[0]?.value, true)}</strong>
                  <small>/ 슬래시 커맨드로 시작한 프롬프트</small>
                </div>
              )}
            </Result>
            <h3>도구 액션 프로필</h3>
            <Rows result={r.C} retry={retry}>
              {(rows) => {
                const total = rows.reduce((v, r) => v + (number(r.cells.calls) || 0), 0);
                const proportions = rows.map((r) => ({
                  ...r,
                  cells: {
                    ratio: total
                      ? { value: (number(r.cells.calls) || 0) / total, state: 'value' as const }
                      : { value: null, state: 'zero-denominator' as const },
                  },
                }));
                return (
                  <Bars
                    rows={proportions}
                    field="ratio"
                    dimension="action"
                    ratio
                    max={0.4}
                    color="var(--accent-blue)"
                  />
                );
              }}
            </Rows>
          </div>
        </div>
      )}
    </Widget>
  );
}
function Compression() {
  return (
    <Widget
      id="compaction"
      title="컨텍스트 압축"
      subtitle=""
      definition="절감률 = (압축 전 − 후 토큰) ÷ 압축 전. 평균이 아닌 토큰 합계 기준 비율입니다."
      caption="절감률 = (압축 전 − 후 토큰) ÷ 압축 전"
      size="compression"
      queries={[
        q('compactions', 'timeseries', { group_by: ['trigger'], interval: '1d' }),
        q('compaction_reduction', 'timeseries', { ref_id: 'B', interval: '1d' }),
        q('compactions', 'scalar', { ref_id: 'C', group_by: ['trigger'] }),
        q('compaction_reduction', 'scalar', { ref_id: 'D' }),
      ]}
    >
      {(r, retry) => {
        const a = series(r.A),
          b = series(r.B);
        const rows = timeline([
          ...a.points.map((p) => ({ ...p, labels: { type: p.labels.trigger } })),
          ...b.points.map((p) => ({ ...p, labels: { type: 'reduction' } })),
        ]);
        return (
          <>
            <div className={s.legend}>
              <span>auto</span>
              <span>manual</span>
              <span>절감률</span>
            </div>
            {a.state === 'success' || b.state === 'success' ? (
              <>
                <div className={s.compactionChart}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={rows} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                      <XAxis
                        {...axis}
                        dataKey="time"
                        tickFormatter={(v) => shortDate(Number(v))}
                        minTickGap={15}
                      />
                      <YAxis
                        {...axis}
                        width={25}
                        domain={[0, (max: number) => Math.ceil(max / 20) * 20]}
                        tickCount={3}
                      />
                      <YAxis
                        {...axis}
                        yAxisId="ratio"
                        orientation="right"
                        domain={[0, 1]}
                        width={40}
                        tickFormatter={(v) => `${v * 100}%`}
                      />
                      <CartesianGrid vertical={false} stroke="var(--border-default)" />
                      <Tooltip contentStyle={tip} labelFormatter={(v) => shortDate(Number(v))} />
                      {a.state === 'success' &&
                        ['auto', 'manual'].map((key, i) => (
                          <Bar
                            key={key}
                            dataKey={key}
                            stackId="compaction"
                            fill={i ? 'var(--chart-seq4)' : 'var(--accent-blue)'}
                            isAnimationActive={false}
                          />
                        ))}
                      {b.state === 'success' && (
                        <Line
                          yAxisId="ratio"
                          dataKey="reduction"
                          stroke="var(--accent-green)"
                          dot={false}
                          isAnimationActive={false}
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <DataTable points={a.points} title="압축 횟수" />
                <DataTable points={b.points} title="압축 절감률 추세" />
                {[a, b].some((x) => x.state === 'error') && (
                  <WidgetState status="error" onRetry={retry} />
                )}
              </>
            ) : (
              <WidgetState status={a.state} onRetry={retry} />
            )}
            <div className={s.compactionStat}>
              <Result result={r.D} title="압축 절감률" retry={retry}>
                {(p) => <strong>{text(p[0]?.value, true)}</strong>}
              </Result>
              <Rows result={r.C} retry={retry}>
                {(rows) => (
                  <span>
                    토큰 합계 기준 절감률 · 압축{' '}
                    {rows
                      .reduce((n, r) => n + (number(r.cells.compactions) || 0), 0)
                      .toLocaleString()}
                    회 (
                    {rows
                      .map((r) => `${r.labels.trigger} ${text(r.cells.compactions)}`)
                      .join(' · ')}
                    )
                  </span>
                )}
              </Rows>
            </div>
          </>
        );
      }}
    </Widget>
  );
}
function Quality() {
  const { value } = useScopedFilters();
  return (
    <Widget
      id="quality"
      title="품질"
      subtitle="도구 실패 · MCP 연결"
      definition="실패 여부가 판정된 도구 호출의 실패 비율과 오류 유형입니다. MCP 실패율은 org 서버만 표시합니다."
      caption="도구 실패 = tool_result.is_error · 마찰 계열(주황)로 표시 · 이상 탐지 스파이크는 운영·보안에서"
      size="full"
      queries={[
        q('tool_calls', 'table', {
          group_by: ['error_type'],
          limit: 8,
          params: { success: false },
        }),
        q('tool_failure_rate', 'scalar', { ref_id: 'B' }),
        q('mcp_failure_ratio', 'table', {
          ref_id: 'C',
          group_by: ['server_name'],
          params: { server_scope: 'org' },
        }),
      ]}
    >
      {(r, retry) => (
        <div className={s.quality}>
          <div>
            <h3>
              도구 실패 유형 <small>· error_type 상위 8 · 건수</small>
            </h3>
            <Rows result={r.A} retry={retry}>
              {(rows) => <Bars rows={rows} field="calls" dimension="error_type" />}
            </Rows>
          </div>
          <div className={s.qualityStat}>
            <h3>도구 실패율</h3>
            <Rows result={r.B} retry={retry}>
              {(rows) => {
                const row = rows[0],
                  v = number(row.cells.failure_rate),
                  prev = number(row.cells.failure_rate_compare);
                return (
                  <>
                    <strong>{text(row.cells.failure_rate, true)}</strong>
                    <small>
                      실패 {text(row.cells.failures)} ÷ 호출 {text(row.cells.calls)}
                    </small>
                    {value.compare !== 'none' && v !== null && prev !== null && (
                      <small>
                        {((v - prev) * 100).toFixed(1)}pt{' '}
                        {value.compare === 'previous_week' ? '전주' : '직전 기간'} 대비
                      </small>
                    )}
                  </>
                );
              }}
            </Rows>
          </div>
          <div className={s.mcpQuality}>
            <h3>
              MCP 연결 실패율 <small>· org 스코프 서버만</small>
            </h3>
            <Rows result={r.C} retry={retry}>
              {(rows) => (
                <Bars
                  rows={rows.filter((r) => r.labels.server_scope === 'org')}
                  field="ratio"
                  dimension="server_name"
                  ratio
                  max={0.05}
                />
              )}
            </Rows>
            <div className={s.scale}>
              <span>0%</span>
              <span>2.5%</span>
              <span>5%</span>
            </div>
            <p className={s.muted}>project·user 스코프 서버는 개인 추정 가능성으로 제외</p>
          </div>
        </div>
      )}
    </Widget>
  );
}
export function TeamDetails() {
  return (
    <>
      <Friction />
      <Features />
      <Compression />
      <Quality />
    </>
  );
}
