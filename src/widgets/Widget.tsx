import { AuditDialog } from '../pages/operations/shared';
import { useState, type ReactNode } from 'react';
import { Button, WidgetCard, WidgetState } from '../components/ui';
import { useWidget } from './useWidget';
import { series, format, type Point } from './model';
import type { QueryRequest, QueryResult } from '../api/types';
import s from '../pages/teams/Teams.module.css';
type Query = QueryRequest['queries'][number];
export const q = (
  metric_id: Query['metric_id'],
  frame_type: Query['frame_type'] = 'scalar',
  extra: Partial<Query> = {},
): Query => ({ ref_id: 'A', metric_id, frame_type, ...extra });
const tokenColors = [1, 2, 3, 4].map((n) => `var(--chart-seq${n})`);
export const shortDate = (v: number) =>
  !Number.isFinite(v)
    ? '—'
    : new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul',
        month: 'numeric',
        day: 'numeric',
      }).format(new Date(v));
export const axis = {
  tick: { fontSize: 11, fill: 'var(--text-3)' },
  axisLine: false,
  tickLine: false,
};
export const tip = {
  background: 'var(--surface-card)',
  border: '1px solid var(--border-default)',
  borderRadius: 6,
  color: 'var(--text-1)',
  fontSize: 12,
};
export function Legend({ labels, colors }: { labels: string[]; colors: string[] }) {
  return (
    <div className={s.legend}>
      {labels.map((label, i) => (
        <span key={label}>
          <i style={{ background: colors[i % colors.length] }} />
          {label}
        </span>
      ))}
    </div>
  );
}
export function DataTable({ points, title }: { points: Point[]; title: string }) {
  return (
    <details className={s.tableDetails}>
      <summary>{title} 데이터 표</summary>
      <div className={s.tableScroll}>
        <table>
          <thead>
            <tr>
              <th>구간 / 그룹</th>
              <th>값</th>
              <th>단위</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={i}>
                <td>
                  {typeof p.key === 'number' ? shortDate(p.key) : p.key}{' '}
                  {Object.values(p.labels).join(' · ')}
                </td>
                <td>{format(p.value, p.unit)}</td>
                <td>{p.unit === 'ratio' ? '%' : p.unit === 's' ? '시간' : p.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
export function Result({
  result,
  title,
  retry,
  children,
}: {
  result?: QueryResult;
  title: string;
  retry: () => void;
  children: (points: Point[]) => ReactNode;
}) {
  const model = series(result);
  if (model.state === 'empty' && model.points.some((p) => p.value.state === 'zero-denominator'))
    return <p className={s.noRatio}>분모 0 · 비율을 계산할 수 없습니다.</p>;
  if (model.state !== 'success') return <WidgetState status={model.state} onRetry={retry} />;
  return (
    <>
      {children(model.points)}
      <DataTable points={model.points} title={title} />
    </>
  );
}
export function Widget({
  id,
  title,
  subtitle,
  definition,
  caption,
  queries,
  children,
  controls,
  headerLegend,
  recentWeeks = false,
  size = 'small',
  requestPatch,
}: {
  id: string;
  title: string;
  subtitle: string;
  definition: string;
  caption: string;
  queries: QueryRequest['queries'];
  controls?: ReactNode;
  headerLegend?: ReactNode;
  recentWeeks?: boolean;
  requestPatch?: Partial<QueryRequest>;
  size?: string;
  children: (data: Record<string, QueryResult>, retry: () => void) => ReactNode;
}) {
  const { ref, query, authorized, authorize } = useWidget(id, queries, recentWeeks, requestPatch);
  const [auditOpen, setAuditOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [tables, setTables] = useState(false);
  return (
    <div
      ref={ref}
      className={`${s.widget} ${s[size] || ''} ${tables ? s.showTables : ''}`}
      data-widget={id}
      data-fetching={query.isFetching}
    >
      <WidgetCard
        title={title}
        subtitle={subtitle}
        definition={definition}
        caption={caption}
        action={
          <div className={s.headerActions}>
            {headerLegend}
            {id === 'output' && (
              <Legend
                labels={['LoC 추가', '삭제', '커밋', 'PR']}
                colors={[
                  'var(--accent-green)',
                  'var(--accent-green-tint)',
                  'var(--accent-green)',
                  'var(--accent-green)',
                ]}
              />
            )}{' '}
            {id === 'tokens' && (
              <Legend
                labels={['input', 'output', 'cacheRead', 'cacheCreation']}
                colors={tokenColors}
              />
            )}
            <div className={s.menu}>
              <button
                aria-label={`${title} 메뉴`}
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
              >
                ⋯
              </button>
              {menu && (
                <div className={s.menuPanel}>
                  <Button
                    onClick={() => {
                      if (!authorized) { setAuditOpen(true); setMenu(false); return; }
                      query.refetch();
                      setMenu(false);
                    }}
                  >
                    이 위젯 새로고침
                  </Button>
                  <Button
                    onClick={() => {
                      setTables(!tables);
                      setMenu(false);
                    }}
                  >
                    {tables ? '데이터 표 숨기기' : '데이터 표 보기'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        }
      >
        {controls}
        {!authorized ? (
          <Button onClick={() => setAuditOpen(true)}>조회 사유 입력</Button>
        ) : query.isPending ? (
          <WidgetState status="loading" />
        ) : query.isError ? (
          <WidgetState status="error" onRetry={() => query.refetch()} />
        ) : (
          children(query.data.results, () => query.refetch())
        )}
      </WidgetCard>
      {auditOpen && <AuditDialog target={title} onCancel={() => setAuditOpen(false)}
        onSubmit={reason => { authorize(reason); setAuditOpen(false); }} />}
    </div>
  );
}
