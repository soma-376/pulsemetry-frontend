import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from 'recharts';
import widgetMapping from './widgetMap.json';
import { Badge, Button, WidgetCard } from '../../components/ui';
import {
  scenarioApi,
  activeRun,
  type Run,
  type SavedReport,
  type SaveInput,
  type RunSummary,
} from '../../api/scenarios';
import { ApiError } from '../../api/client';
import { useAuth } from '../../app/auth';
import { useScopedFilters } from '../../app/filterContext';
import { writeFilters } from '../../app/filters';
import { adaptResult } from '../../api/frames';
import type { QueryResult } from '../../api/types';
import { DataTable, axis, tip, shortDate } from '../../widgets/Widget';
import { series, format, number } from '../../widgets/model';
import { useRuns, statusLabel } from './RunProvider';
import {
  hasMaskedFrames,
  rerunInput,
  resultFilters,
  resultPath,
  resultRestricted,
  shareUrl,
  targetNames,
  targetPaths,
} from './resultModel';
import s from './Reports.module.css';
const message = (e: unknown) =>
  `${(e as Error).message}${e instanceof ApiError && e.requestId ? ` · request_id: ${e.requestId}` : ''}`;
const stamp = (value?: string | null) =>
  value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(value))
    : '—';
const severity = {
  anomaly: ['이상', 'red'],
  warning: ['주의', 'orange'],
  info: ['정보', 'blue'],
} as const;
function Counts({ counts }: { counts?: RunSummary['findings_count'] }) {
  return (
    <span className={s.counts}>
      {(Object.keys(severity) as (keyof typeof severity)[]).map((k) =>
        counts?.[k] ? (
          <Badge key={k} tone={severity[k][1]}>
            {severity[k][0]} {counts[k]}
          </Badge>
        ) : null,
      )}
    </span>
  );
}
export function ReportDialog({
  title,
  close,
  busy,
  children,
}: {
  title: string;
  close: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      queueMicrotask(() => opener.current?.isConnected && opener.current.focus());
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={s.modal}
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key !== 'Tab') return;
        const focusable = [
          ...e.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]',
          ),
        ].filter(
          (el) =>
            el.getClientRects().length &&
            !(el instanceof HTMLInputElement && el.type === 'radio' && !el.checked),
        );
        const first = focusable[0],
          last = focusable.at(-1);
        if (!first) {
          e.preventDefault();
          return;
        }
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}
function SaveDialog({ run, close, done }: { run: Run; close: () => void; done: () => void }) {
  const [name, setName] = useState(`${run.scenario_id} 분석 리포트`),
    [note, setNote] = useState(''),
    [mode, setMode] = useState<SaveInput['time_mode']>('fixed'),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  const busy = useRef(false),
    controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const relative = Object.values(run.params || {}).some(
    (v) => typeof v === 'string' && /^now(?:-|$)/.test(v),
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy.current) return;
    if (!name.trim()) {
      setError('이름을 입력하세요.');
      return;
    }
    busy.current = true;
    setPending(true);
    setError('');
    const c = (controller.current = new AbortController());
    try {
      await scenarioApi.save(
        run.run_id!,
        { name: name.trim(), note: note.trim(), time_mode: mode },
        c.signal,
      );
      if (!c.signal.aborted) done();
    } catch (e) {
      if (!c.signal.aborted) setError(message(e));
    } finally {
      busy.current = false;
      if (!c.signal.aborted) setPending(false);
    }
  }
  return (
    <ReportDialog title="리포트 저장" close={close} busy={pending}>
      <small className={s.runId}>
        {run.scenario_id} · {run.run_id?.slice(0, 8)}
      </small>
      <form onSubmit={submit}>
        <label>
          이름
          <input
            autoFocus
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pending}
          />
        </label>
        <label>
          메모 <small>(선택)</small>
          <textarea
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={pending}
          />
        </label>
        <fieldset disabled={pending}>
          <legend className={s.srOnly}>기간 저장 방식</legend>
          <label className={s.radio} data-selected={mode === 'fixed'}>
            <input
              type="radio"
              name="time-mode"
              checked={mode === 'fixed'}
              onChange={() => setMode('fixed')}
            />
            <span>
              파라미터 고정
              <small>
                {stamp(run.resolved_from)} → {stamp(run.resolved_to)} 절대 범위 · 열 때 같은 결과
              </small>
            </span>
          </label>
          <label className={s.radio} data-selected={mode === 'relative'}>
            <input
              type="radio"
              name="time-mode"
              checked={mode === 'relative'}
              disabled={!relative}
              onChange={() => setMode('relative')}
            />
            <span>
              기간을 상대식으로 유지
              <small>
                {relative
                  ? `${run.params?.from || run.params?.as_of || '상대 기간'} · 열 때마다 최신 기간으로 재실행`
                  : '현재 실행에는 상대 기간이 없습니다.'}
              </small>
            </span>
          </label>
        </fieldset>
        <p className={s.muted}>
          공유 링크 <code>/runs/{run.run_id?.slice(0, 8)}…</code> · 같은 테넌트의 접근 권한 필요
        </p>
        {error && (
          <p role="alert" className={s.error}>
            {error}
          </p>
        )}
        <footer>
          <Button disabled={pending} onClick={close}>
            취소
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? '저장 중…' : '저장'}
          </Button>
        </footer>
      </form>
    </ReportDialog>
  );
}
function FrameView({ result }: { result: QueryResult }) {
  const model = series(result);
  const adapted = adaptResult(result);
  if (adapted.status === 'error')
    return (
      <p role="alert" className={s.error}>
        {adapted.message} · 실행 결과를 다시 확인하세요.
      </p>
    );
  if (model.state === 'masked' && !model.points.some((p) => p.value.state === 'value'))
    return <p className={s.empty}>n&lt;5 · 최소 집계 단위 미만 · 비공개</p>;
  if (!adapted.frames.some((f) => f.rows.length))
    return <p className={s.empty}>이 실행에 관측 데이터가 없습니다.</p>;
  // Do not join unrelated numeric fields into one time series. Preserve the full
  // server schema in an accessible table when a frame has multiple measures.
  const ambiguous = adapted.frames.some(
    (f) => f.fields.filter((c) => c.type === 'number' && !c.name.endsWith('_compare')).length !== 1,
  );
  if (ambiguous)
    return (
      <div className={s.schemaTables}>
        {adapted.frames.map((f, i) => (
          <div className={s.tableScroll} key={i}>
            <table>
              <thead>
                <tr>
                  {f.fields.map((field, j) => (
                    <th key={j}>{field.config?.display_name || field.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {f.rows.map((row, j) => (
                  <tr key={j}>
                    {row.map((cell, k) => (
                      <td key={k}>
                        {cell.state === 'masked'
                          ? '비공개'
                          : cell.state === 'missing'
                            ? '미관측'
                            : cell.state === 'zero-denominator'
                              ? '분모 0'
                              : f.fields[k].type === 'number'
                                ? format(cell, f.fields[k].config?.unit)
                                : f.fields[k].type === 'time'
                                  ? stamp(new Date(Number(cell.value)).toISOString())
                                  : String(cell.value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  const frame = adapted.frames[0];
  const points = model.points;
  const rows = points.map((p, i) => ({
    key:
      typeof p.key === 'number'
        ? shortDate(p.key)
        : `${p.labels.team_name || p.labels.model || p.labels.type || p.key}${p.value.state === 'masked' ? ' · n<5' : ''}`,
    value: number(p.value),
    index: i,
  }));
  const time = frame?.type === 'timeseries';
  return (
    <>
      <div className={s.chart}>
        {frame?.type === 'scalar' ? (
          <div className={s.scalars}>
            {points.map((p, i) => (
              <div key={i}>
                <small>{Object.values(p.labels).join(' · ') || String(p.key)}</small>
                <strong>
                  {format(p.value, p.unit)}
                  {p.unit === 'ratio' ? '%' : ''}
                </strong>
              </div>
            ))}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {time ? (
              <LineChart data={rows} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid
                  vertical={false}
                  stroke="var(--border-default)"
                  strokeDasharray="3 3"
                />
                <XAxis {...axis} dataKey="key" minTickGap={30} />
                <YAxis {...axis} width={60} />
                <Tooltip contentStyle={tip} />
                <Line
                  isAnimationActive={false}
                  type="linear"
                  dataKey="value"
                  stroke="var(--accent-purple)"
                  dot={false}
                  strokeWidth={2}
                  connectNulls={false}
                />
              </LineChart>
            ) : (
              <BarChart
                data={rows}
                layout="vertical"
                margin={{ top: 12, right: 16, left: 0, bottom: 0 }}
              >
                <XAxis {...axis} type="number" />
                <YAxis {...axis} type="category" dataKey="key" width={80} />
                <Tooltip contentStyle={tip} />
                <Bar
                  isAnimationActive={false}
                  dataKey="value"
                  fill="var(--accent-purple)"
                  radius={[0, 3, 3, 0]}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
      <DataTable points={points} title="실행 결과" />
    </>
  );
}
const metricTitles: Record<string, string> = {
  cost: '비용 추세',
  cost_anomaly: '비용 이상',
  tokens: '토큰',
  active_users: '활성 사용자',
  sessions: '세션',
  adoption_rate: '도입률',
  tool_failure_rate: '도구 실패율',
  cost_per_active_user: '활성 사용자당 비용',
  lines_of_code: 'AI 관여 LoC',
  cache_read_ratio: '캐시 읽기 비율',
};
function FrameCards({ run }: { run: Run }) {
  const frames = run.result?.frames || {},
    highlight = run.result?.highlight_widgets || [];
  const cards = Object.entries(frames).flatMap<{
    metric: string;
    result: QueryResult;
    type?: string;
    key: string;
  }>(([metric, result]) => {
    if (!result.frames.length || result.status !== 200) return [{ metric, result, key: metric }];
    const tables = result.frames.filter((f) => f.schema.frame_type === 'table');
    return [
      ...result.frames
        .filter((f) => f.schema.frame_type !== 'table')
        .map((frame, i) => ({
          metric,
          result: { ...result, frames: [frame] },
          type: frame.schema.frame_type,
          key: `${metric}-${i}`,
        })),
      ...(tables.length
        ? [{ metric, result: { ...result, frames: tables }, type: 'table', key: `${metric}-table` }]
        : []),
    ];
  });
  const widget = (metric: string, type: unknown) => {
    const candidates = (widgetMapping as Record<string, string[]>)[metric] || [];
    if (metric === 'cost' && run.result?.target_page === 'P1')
      return type === 'table' ? 'W1.3' : type === 'timeseries' ? 'W1.2' : 'W1.1';
    return (
      candidates.find((id) => highlight.includes(id)) ||
      candidates.find((id) =>
        id.startsWith((run.result?.target_page || 'P1').replace('P', 'W') + '.'),
      )
    );
  };
  const ordered = [...cards].sort(
    (a, b) => Number(!!widget(b.metric, b.type)) - Number(!!widget(a.metric, a.type)),
  );
  return (
    <div className={s.frames}>
      {ordered.map((c, i) => {
        const id = widget(c.metric, c.type);
        return (
          <section
            key={c.key}
            id={`frame-${c.key}`}
            tabIndex={-1}
            data-result-widget={id || c.metric}
            data-result-metric={c.metric}
            className={`${s.frame} ${id && highlight.includes(id) ? s.highlight : ''} ${i === 0 ? s.first : ''}`}
          >
            <WidgetCard
              emphasis={id && highlight.includes(id) ? 'highlighted' : 'default'}
              title={
                c.metric === 'cost' && c.type === 'table'
                  ? '팀별 비용'
                  : metricTitles[c.metric] || c.metric
              }
              subtitle={`${id || c.metric} · 실행 시점`}
              caption={c.result.frames[0]?.schema.meta?.caveat || '실행 응답의 집계 결과'}
            >
              <FrameView result={c.result} />
            </WidgetCard>
          </section>
        );
      })}
      {!cards.length && <p className={s.empty}>반환된 프레임이 없습니다.</p>}
      {highlight
        .filter((id) => !cards.some((c) => widget(c.metric, c.type) === id))
        .map((id) => (
          <section key={id} data-result-widget={id} tabIndex={-1} className={s.unmapped}>
            <h3>{id}</h3>
            <p>이 위젯에 대응하는 결과가 없습니다. 반환된 지표를 위에서 확인하세요.</p>
          </section>
        ))}
    </div>
  );
}
export function RunReport() {
  const { runId = '' } = useParams();
  return <RunReportBody key={runId} runId={runId} />;
}
function RunReportBody({ runId }: { runId: string }) {
  const runs = useRuns(),
    { profile } = useAuth(),
    scope = useScopedFilters(),
    navigate = useNavigate(),
    cache = useQueryClient();
  const entry = runs.entries.find((e) => e.run.run_id === runId);
  const lookup = useQuery({
    queryKey: ['run', profile?.member_id, runId],
    queryFn: ({ signal }) => scenarioApi.get(runId, signal),
    enabled: !entry,
  });
  const run = entry?.run || lookup.data?.run;
  const [save, setSave] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState('');
  const applied = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (lookup.data && !entry) runs.accept(lookup.data.run, lookup.data.retryMs);
  }, [lookup.data, entry, runs]);
  const restricted =
    run?.status === 'succeeded' &&
    resultRestricted(run, profile?.role, profile?.accessible_team_ids);
  useEffect(() => {
    if (run?.result && !restricted && !applied.current) {
      applied.current = true;
      navigate(resultPath(runId) + '?' + writeFilters(resultFilters(run)), { replace: true });
    }
  }, [run, runId, restricted, navigate]);
  async function repeat() {
    if (!run) return;
    setError('');
    try {
      const id = await runs.start(run.scenario_id!, entry?.input || rerunInput(run));
      if (mounted.current) navigate(resultPath(id));
    } catch (e) {
      setError(message(e));
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl(runId));
      setNotice('공유 링크를 복사했습니다.');
    } catch {
      setError('클립보드에 접근할 수 없습니다. 주소 표시줄의 실행 링크를 복사하세요.');
    }
  }
  if (!run)
    return (
      <section className={s.state}>
        <h1>시나리오 실행</h1>
        {lookup.isError ? (
          <>
            <p role="alert">{message(lookup.error)}</p>
            <Button onClick={() => lookup.refetch()}>실행 재시도</Button>
          </>
        ) : (
          <p role="status">실행을 불러오는 중…</p>
        )}
        <Link to="/scenarios/history">실행 이력으로</Link>
      </section>
    );
  if (restricted)
    return (
      <section className={s.state}>
        <h1>접근 권한이 없습니다</h1>
        <p>이 결과는 현재 역할 또는 소속 팀 범위를 벗어납니다.</p>
        <Link to="/scenarios/history">실행 이력으로</Link>
      </section>
    );
  if (run.status !== 'succeeded')
    return (
      <section className={s.state}>
        <h1>
          {run.scenario_id} · {statusLabel[run.status!]}
        </h1>
        {error && <p role="alert">{error}</p>}
        {entry?.error && (
          <p role="alert">
            {entry.error}{' '}
            <Button disabled={entry.busy} onClick={() => runs.refresh(runId)}>
              상태 재확인
            </Button>
          </p>
        )}
        {run.error && (
          <p role="alert">
            {run.error.message} · {run.error.request_id}
          </p>
        )}
        {activeRun(run) ? (
          <>
            <p role="status">{run.progress?.label}</p>
            <progress max={run.progress?.total || 4} value={run.progress?.step || 0} />
            <Button disabled={entry?.busy || !entry} onClick={() => runs.cancel(runId)}>
              실행 취소
            </Button>
          </>
        ) : (
          <Button disabled={runs.pending} onClick={repeat}>
            다시 실행
          </Button>
        )}
        <Link to="/scenarios/history">백그라운드로 두기 · 실행 이력</Link>
      </section>
    );
  if (!run.result)
    return (
      <section className={s.state}>
        <h1>완료된 실행에 결과가 없습니다</h1>
        <Button onClick={() => runs.refresh(runId)}>결과 재확인</Button>
        <Link to="/scenarios/history">실행 이력으로</Link>
      </section>
    );
  const target = run.result.target_page || 'P1';
  const protectedEvidence = (metric: unknown) => {
    if (typeof metric === 'string' && run.result?.frames?.[metric])
      return hasMaskedFrames({
        ...run,
        result: { ...run.result, frames: { [metric]: run.result.frames[metric] } },
      });
    return hasMaskedFrames(run);
  };
  function jump(id: string) {
    const el = [...document.querySelectorAll<HTMLElement>('[data-result-widget]')].find(
      (el) => el.dataset.resultWidget === id,
    );
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus({ preventScroll: true });
    }
  }
  return (
    <div className={s.resultPage}>
      <div className={s.banner}>
        <span>
          ■ 시나리오 적용 중: <b>{run.scenario_id}</b>
        </span>
        <span>
          필터 자동 적용 · {scope.value.from} → {scope.value.to} ·{' '}
          {scope.value.price_basis === 'contract' ? '계약' : '공시'} 단가 ·{' '}
          {run.result.highlight_widgets?.join(' / ')} 강조
        </span>
        <Link to={(targetPaths[target] || '/') + '?' + scope.serialized}>해제</Link>
      </div>
      <div className={s.resultGrid}>
        <div className={s.resultMain}>
          <header className={s.title}>
            <h1>{targetNames[target] || '분석 결과'}</h1>
            <span>
              {stamp(run.resolved_from)} → {stamp(run.resolved_to)} · 실행 시점
            </span>
          </header>
          <FrameCards run={run} />
        </div>
        <aside className={s.findings} aria-label="시나리오 판정">
          <header>
            <div>
              <h2>판정 · findings</h2>
              <code title={runId}>
                {runId.slice(0, 8)} · {stamp(run.created_at)}
              </code>
            </div>
            <div>
              <Counts counts={run.findings_count} />
              <small>{run.scenario_id} · 청구액 아님</small>
            </div>
          </header>
          <div className={s.findingList}>
            {(run.result.findings || []).map((f, i) => (
              <article key={`${f.rule_id}-${i}`}>
                <div className={s.counts}>
                  <Badge tone={severity[f.severity]?.[1] || 'gray'}>
                    {severity[f.severity]?.[0] || f.severity}
                  </Badge>
                  <code>{f.widget_id}</code>
                </div>
                <h3>
                  {protectedEvidence(f.evidence?.metric_id)
                    ? '집계 마스킹 적용 · 판정 근거 비공개'
                    : f.title}
                </h3>
                {!protectedEvidence(f.evidence?.metric_id) && (
                  <>
                    <dl>
                      {Object.entries(f.evidence || {})
                        .filter(
                          ([, v]) =>
                            typeof v === 'string' ||
                            typeof v === 'number' ||
                            typeof v === 'boolean',
                        )
                        .map(([k, v]) => (
                          <div key={k}>
                            <dt>{k}</dt>
                            <dd>{String(v)}</dd>
                          </div>
                        ))}
                    </dl>
                    {f.action && <p className={s.action}>권장 · {f.action}</p>}
                  </>
                )}
                {f.widget_id && (
                  <button className={s.jump} onClick={() => jump(f.widget_id!)}>
                    관련 위젯으로 이동 → {f.widget_id}
                  </button>
                )}
              </article>
            ))}
            {!run.result.findings?.length && <p className={s.empty}>반환된 판정이 없습니다.</p>}
          </div>
          <footer>
            <Button variant="primary" onClick={() => setSave(true)}>
              저장
            </Button>
            <Button onClick={copy}>공유 링크 복사</Button>
            <Button disabled={runs.pending} onClick={repeat}>
              다시 실행
            </Button>
          </footer>
        </aside>
      </div>
      {notice && (
        <p role="status" className={s.toast}>
          {notice} <Link to="/scenarios/history">이력 · 저장된 리포트</Link>
        </p>
      )}
      {error && (
        <p role="alert" className={s.toast}>
          {error}
        </p>
      )}
      {save && (
        <SaveDialog
          run={run}
          close={() => setSave(false)}
          done={() => {
            setSave(false);
            setNotice('리포트를 저장했습니다.');
            void cache.invalidateQueries({ queryKey: ['reports'] });
            void cache.invalidateQueries({ queryKey: ['run-history'] });
          }}
        />
      )}
    </div>
  );
}
function Pager({
  stack,
  next,
  pending,
  change,
}: {
  stack: string[];
  next?: string | null;
  pending: boolean;
  change: (stack: string[]) => void;
}) {
  return (
    <div className={s.pager}>
      <Button disabled={pending || !stack.length} onClick={() => change(stack.slice(0, -1))}>
        이전
      </Button>
      <span>{stack.length + 1} 페이지</span>
      <Button disabled={pending || !next} onClick={() => next && change([...stack, next])}>
        다음
      </Button>
    </div>
  );
}
export function History() {
  const { profile } = useAuth(),
    runs = useRuns(),
    navigate = useNavigate(),
    cache = useQueryClient();
  const [runStack, setRunStack] = useState<string[]>([]),
    [savedStack, setSavedStack] = useState<string[]>([]),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState<{
    type: 'run' | 'saved';
    id: string;
    name: string;
  } | null>(null);
  const busy = useRef(false),
    controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const history = useQuery({
    queryKey: ['run-history', profile?.member_id, runStack.at(-1)],
    queryFn: ({ signal }) => scenarioApi.list(runStack.at(-1), signal),
    staleTime: 0,
    refetchInterval: (q) => (q.state.data?.items?.some((r) => activeRun(r)) ? 2000 : false),
  });
  const saved = useQuery({
    queryKey: ['reports', profile?.member_id, savedStack.at(-1)],
    queryFn: ({ signal }) => scenarioApi.saved(savedStack.at(-1), signal),
    staleTime: 0,
  });
  const catalog = useQuery({
    queryKey: ['scenarios', profile?.member_id],
    queryFn: ({ signal }) => scenarioApi.catalog(signal),
  });
  const name = (id?: string) =>
    `${id} ${catalog.data?.items?.find((s) => s.scenario_id === id)?.title || ''}`;
  async function action(work: (signal: AbortSignal) => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    const c = (controller.current = new AbortController());
    try {
      await work(c.signal);
    } catch (e) {
      if (!c.signal.aborted) setError(message(e));
    } finally {
      busy.current = false;
      if (!c.signal.aborted) setPending(false);
    }
  }
  async function openSaved(item: SavedReport) {
    await action(async (signal) => {
      if (item.time_mode !== 'relative') {
        navigate(resultPath(item.run_id!));
        return;
      }
      const { run } = await scenarioApi.get(item.run_id!, signal);
      if (signal.aborted) return;
      if (resultRestricted(run, profile?.role, profile?.accessible_team_ids))
        throw new Error('이 결과를 재실행할 권한이 없습니다.');
      const id = await runs.start(run.scenario_id!, rerunInput(run));
      if (!signal.aborted) navigate(resultPath(id));
    });
  }
  async function remove() {
    if (!deleting) return;
    await action(async (signal) => {
      if (deleting.type === 'run') {
        await scenarioApi.remove(deleting.id, signal);
        runs.forget(deleting.id);
        cache.removeQueries({ queryKey: ['run', profile?.member_id, deleting.id] });
      } else await scenarioApi.removeSaved(deleting.id, signal);
      if (signal.aborted) return;
      setDeleting(null);
      setNotice('삭제했습니다.');
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['run-history'] }),
        cache.invalidateQueries({ queryKey: ['reports'] }),
      ]);
    });
  }
  return (
    <div className={s.history}>
      {notice && <p role="status">{notice}</p>}
      {error && !deleting && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      <section className={s.historyCard}>
        <header>
          <h2>
            실행 이력 <small>· 접근 가능한 실행 · 최신순</small>
          </h2>
          <span>
            공유 링크 형식 <code>/runs/&#123;run_id&#125;</code>
          </span>
          <Button disabled={history.isFetching} onClick={() => history.refetch()}>
            이력 새로고침
          </Button>
        </header>
        {history.isPending ? (
          <p role="status" className={s.empty}>
            실행 이력 불러오는 중…
          </p>
        ) : history.isError ? (
          <p role="alert" className={s.empty}>
            {message(history.error)} <Button onClick={() => history.refetch()}>이력 재시도</Button>
          </p>
        ) : (
          <div className={s.tableScroll}>
            <table>
              <thead>
                <tr>
                  {[
                    '실행 시각',
                    '시나리오',
                    '파라미터 요약',
                    '상태',
                    '실행자',
                    'findings',
                    '작업',
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.data.items?.map((r) => (
                  <tr key={r.run_id}>
                    <td>{stamp(r.created_at)}</td>
                    <td>{name(r.scenario_id)}</td>
                    <td>{r.params_summary}</td>
                    <td>
                      <Badge
                        tone={
                          r.status === 'failed'
                            ? 'red'
                            : r.status === 'succeeded'
                              ? 'green'
                              : 'blue'
                        }
                      >
                        {statusLabel[r.status!]}
                      </Badge>
                    </td>
                    <td>{r.created_by?.display_name || '—'}</td>
                    <td>
                      <Counts counts={r.findings_count} />
                    </td>
                    <td className={s.rowActions}>
                      <Link to={resultPath(r.run_id!)}>열기</Link>
                      <button
                        onClick={() =>
                          void navigator.clipboard
                            .writeText(shareUrl(r.run_id!))
                            .then(() => setNotice('공유 링크를 복사했습니다.'))
                            .catch(() =>
                              setError(
                                '링크를 복사하지 못했습니다. 실행을 열어 주소를 복사하세요.',
                              ),
                            )
                        }
                      >
                        링크 복사
                      </button>
                      <button
                        disabled={
                          activeRun(r) ||
                          pending ||
                          (profile?.role !== 'owner' &&
                            r.created_by?.member_id !== profile?.member_id)
                        }
                        title={activeRun(r) ? '실행을 취소한 뒤 삭제하세요.' : undefined}
                        onClick={() => {
                          setError('');
                          setDeleting({ type: 'run', id: r.run_id!, name: name(r.scenario_id) });
                        }}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!history.data.items?.length && <p className={s.empty}>실행 이력이 없습니다.</p>}
          </div>
        )}
        <Pager
          stack={runStack}
          next={history.data?.next_cursor}
          pending={history.isFetching}
          change={setRunStack}
        />
      </section>
      <section className={s.historyCard}>
        <header>
          <h2>
            저장된 리포트 <small>· 고정 결과 또는 상대 기간으로 재실행</small>
          </h2>
        </header>
        {saved.isPending ? (
          <p role="status" className={s.empty}>
            저장 리포트 불러오는 중…
          </p>
        ) : saved.isError ? (
          <p role="alert" className={s.empty}>
            {message(saved.error)} <Button onClick={() => saved.refetch()}>리포트 재시도</Button>
          </p>
        ) : (
          <div className={s.tableScroll}>
            <table>
              <thead>
                <tr>
                  {['이름', '시나리오', '기간 모드', '메모', '저장', '작업'].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {saved.data.items?.map((item) => (
                  <tr key={item.saved_id}>
                    <td>{item.name}</td>
                    <td>{name(item.scenario_id)}</td>
                    <td>
                      <Badge>
                        {item.time_mode === 'relative' ? '상대 · 열 때 재실행' : '고정 · 같은 결과'}
                      </Badge>
                    </td>
                    <td>{item.note || '—'}</td>
                    <td>
                      {stamp(item.created_at)} · {item.created_by?.display_name || '—'}
                    </td>
                    <td className={s.rowActions}>
                      <button disabled={pending || runs.pending} onClick={() => openSaved(item)}>
                        열기
                      </button>
                      <button
                        disabled={
                          pending ||
                          (profile?.role !== 'owner' &&
                            item.created_by?.member_id !== profile?.member_id)
                        }
                        onClick={() => {
                          setError('');
                          setDeleting({
                            type: 'saved',
                            id: item.saved_id!,
                            name: item.name || '리포트',
                          });
                        }}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!saved.data.items?.length && (
              <p className={s.empty}>
                저장된 리포트가 없습니다. 완료된 실행에서 저장할 수 있습니다.
              </p>
            )}
          </div>
        )}
        <Pager
          stack={savedStack}
          next={saved.data?.next_cursor}
          pending={saved.isFetching}
          change={setSavedStack}
        />
      </section>
      {deleting && (
        <ReportDialog
          title={deleting.type === 'run' ? '실행 이력 삭제' : '저장 리포트 삭제'}
          close={() => setDeleting(null)}
          busy={pending}
        >
          <p>
            <b>{deleting.name}</b>을 삭제할까요?
          </p>
          <p>
            {deleting.type === 'run'
              ? '이 실행의 공유 링크로 결과를 열 수 없게 됩니다.'
              : '저장 항목만 삭제하며 원본 실행 결과는 유지합니다.'}
          </p>
          {error && (
            <p role="alert" className={s.error}>
              {error}
            </p>
          )}
          <footer>
            <Button disabled={pending} onClick={() => setDeleting(null)}>
              취소
            </Button>
            <Button variant="primary" disabled={pending} onClick={remove}>
              {pending ? '삭제 중…' : '삭제'}
            </Button>
          </footer>
        </ReportDialog>
      )}
    </div>
  );
}
