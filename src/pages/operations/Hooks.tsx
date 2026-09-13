import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Widget, q, axis, tip, Legend, Result, DataTable, shortDate } from '../../widgets/Widget';
import { series, number, format } from '../../widgets/model';
import { WidgetState } from '../../components/ui';
import s from './Operations.module.css';
export function Hooks() {
  return (
    <Widget
      id="ops-hooks"
      title="훅 실행 · 차단"
      subtitle="일 단위"
      definition="훅 스팬 실행 수와 num_blocking 합계 · 상세 tracing 필요"
      caption="차단은 정책 동작(마찰) · 위반을 의미하지 않습니다."
      headerLegend={
        <Legend
          labels={['PreToolUse', 'PostToolUse', '기타', '차단']}
          colors={[
            'var(--accent-blue)',
            'var(--chart-seq2)',
            'var(--chart-seq3)',
            'var(--accent-orange)',
          ]}
        />
      }
      queries={[
        q('hook_executions', 'timeseries', { group_by: ['hook_event'], interval: '1d' }),
        q('hook_blocking', 'timeseries', { ref_id: 'B', interval: '1d' }),
        q('hook_executions', 'scalar', { ref_id: 'C' }),
      ]}
    >
      {(data, retry) => {
        const a = series(data.A),
          b = series(data.B);
        const merged = new Map<string | number, Record<string, number | string | null>>();
        for (const p of a.points) {
          const row = merged.get(p.key) || { time: p.key };
          row[p.labels.hook_event || 'executions'] = number(p.value);
          merged.set(p.key, row);
        }
        for (const p of b.points) {
          const row = merged.get(p.key) || { time: p.key };
          row.blocking = number(p.value);
          merged.set(p.key, row);
        }
        const keys = [...new Set(a.points.map((p) => p.labels.hook_event || 'executions'))];
        return (
          <>
            {a.state === 'error' && <WidgetState status="error" onRetry={retry} />}{' '}
            {b.state === 'error' && (
              <p role="alert">
                차단 조회 실패 <button onClick={retry}>재시도</button>
              </p>
            )}
            {a.state === 'masked' || b.state === 'masked' ? (
              <WidgetState status="masked" />
            ) : a.state === 'success' || b.state === 'success' ? (
              <div className={s.chart}>
                <ResponsiveContainer>
                  <ComposedChart
                    data={[...merged.values()].sort((a, b) => Number(a.time) - Number(b.time))}
                    margin={{ left: -18, right: -18, top: 8 }}
                  >
                    <CartesianGrid
                      vertical={false}
                      stroke="var(--border-default)"
                      strokeDasharray="3 3"
                    />
                    <XAxis {...axis} dataKey="time" tickFormatter={shortDate} />
                    <YAxis {...axis} yAxisId="calls" />
                    <YAxis {...axis} yAxisId="blocking" orientation="right" />
                    <Tooltip contentStyle={tip} labelFormatter={(v) => shortDate(Number(v))} />
                    {keys.map((k, i) => (
                      <Bar
                        key={k}
                        yAxisId="calls"
                        dataKey={k}
                        stackId="hooks"
                        fill={
                          ['var(--accent-blue)', 'var(--chart-seq2)', 'var(--chart-seq3)'][i % 3]
                        }
                        isAnimationActive={false}
                      />
                    ))}
                    <Line
                      yAxisId="blocking"
                      dataKey="blocking"
                      stroke="var(--accent-orange)"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : a.state !== 'error' && b.state !== 'error' ? (
              <WidgetState status="empty" />
            ) : null}
            <Result result={data.C} retry={retry} title="훅 실행 세션 비율">
              {(p) => {
                const total = number(p.find((v) => v.key === 'sessions')?.value),
                  withHooks = number(p.find((v) => v.key === 'sessions_with_hooks')?.value);
                return (
                  <p className={s.caption}>
                    훅 실행 세션 비율{' '}
                    {total === 0
                      ? '분모 0'
                      : total && withHooks !== null
                        ? `${((withHooks / total) * 100).toFixed(1)}%`
                        : '미관측'}{' '}
                    · 차단 합{' '}
                    {b.state === 'success'
                      ? format({
                          state: 'value',
                          value: b.points.reduce((sum, p) => sum + (number(p.value) || 0), 0),
                        })
                      : '미관측'}
                    건
                  </p>
                );
              }}
            </Result>
            <DataTable title="훅 실행" points={a.points} />
            <DataTable title="훅 차단" points={b.points} />
          </>
        );
      }}
    </Widget>
  );
}
