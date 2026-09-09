import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button } from '../../components/ui';
import { scenarioApi, activeRun, type Scenario, type Detail } from '../../api/scenarios';
import { ApiError, mockMode } from '../../api/client';
import { useAuth } from '../../app/auth';
import { useScopedFilters } from '../../app/filterContext';
import { useRuns, statusLabel, type RunEntry } from './RunProvider';
import { defaults, labels, validateParams, type Schema } from './params';
import s from './Scenarios.module.css';
export function Availability({ value }: { value: Scenario['availability'] }) {
  return (
    <Badge tone={value === 'available' ? 'blue' : value === 'partial' ? 'orange' : 'gray'}>
      {value === 'available' ? '가능' : value === 'partial' ? '부분' : '준비 중'}
    </Badge>
  );
}
export function ScenarioHeader() {
  const runs = useRuns();
  return (
    <div className={s.header}>
      <h1>시나리오</h1>
      <a href="#catalog">카탈로그</a>
      <span title="7단계에서 제공">이력 · 저장된 리포트</span>
      <small aria-live="polite">
        {runs.entries.filter((e) => activeRun(e.run)).length > 0
          ? `${runs.entries.filter((e) => activeRun(e.run)).length}개 실행 중`
          : runs.entries.length
            ? `최근 실행 ${statusLabel[runs.entries[0].run.status!]}`
            : ''}
      </small>
      <label className={s.search}>
        <span>검색</span>
        <input
          id="scenario-search"
          type="search"
          placeholder="질문·시나리오 검색"
          aria-label="시나리오 검색"
          onChange={(e) =>
            window.dispatchEvent(new CustomEvent('scenario-search', { detail: e.target.value }))
          }
        />
      </label>
    </div>
  );
}
export function Scenarios() {
  const { profile } = useAuth(),
    { options } = useScopedFilters(),
    runs = useRuns();
  const catalog = useQuery({
    queryKey: ['scenarios', profile?.member_id],
    queryFn: ({ signal }) => scenarioApi.catalog(signal),
  });
  const [category, setCategory] = useState('cost'),
    [search, setSearch] = useState(''),
    [selected, setSelected] = useState<string | null>(null),
    [runId, setRunId] = useState<string | null>(null),
    [welcome, setWelcome] = useState(
      () => sessionStorage.getItem('pulsemetry.scenarios.visited') !== '1',
    );
  useEffect(() => {
    const handler = (e: Event) => setSearch((e as CustomEvent<string>).detail);
    window.addEventListener('scenario-search', handler);
    const key = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)
      ) {
        e.preventDefault();
        document.getElementById('scenario-search')?.focus();
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('scenario-search', handler);
      window.removeEventListener('keydown', key);
    };
  }, []);
  const items = catalog.data?.items || [],
    sorted = (list: Scenario[]) =>
      [...list].sort((a, b) => Number(!!b.featured) - Number(!!a.featured));
  const shown = sorted(
    items.filter((i) =>
      search
        ? `${i.scenario_id} ${i.title} ${i.situation || ''}`
            .toLowerCase()
            .includes(search.toLowerCase())
        : i.category === category,
    ),
  );
  const current = runId ? runs.entries.find((e) => e.run.run_id === runId) : undefined;
  function visit() {
    setWelcome(false);
    sessionStorage.setItem('pulsemetry.scenarios.visited', '1');
  }
  function open(id: string) {
    visit();
    setRunId(null);
    setSelected(id);
  }
  function card(item: Scenario) {
    return (
      <button
        key={item.scenario_id}
        className={s.card}
        data-availability={item.availability}
        onClick={() => open(item.scenario_id)}
      >
        <div className={s.cardTop}>
          <code>
            {item.featured ? '★ ' : ''}
            {item.scenario_id}
          </code>
          <Availability value={item.availability} />
        </div>
        <h3>{item.title}</h3>
        <p title={item.situation}>{item.situation}</p>
        <div className={s.tags}>
          <b>{item.target_page}</b>
          {(item.required_params || [])
            .filter((k) => k !== 'to')
            .map((k) => (
              <span key={k}>{k === 'from' ? '기간' : labels[k] || k}</span>
            ))}
        </div>
      </button>
    );
  }
  return (
    <div className={s.layout} id="catalog">
      <section className={s.catalog}>
        <nav className={s.categories} aria-label="시나리오 카테고리">
          {catalog.data?.categories?.map((c) => (
            <button
              key={c.id}
              aria-pressed={!search && category === c.id}
              onClick={() => {
                setCategory(c.id!);
                setSearch('');
                const input = document.getElementById('scenario-search') as HTMLInputElement | null;
                if (input) input.value = '';
                visit();
              }}
            >
              {c.title} <small>{items.filter((i) => i.category === c.id).length}</small>
            </button>
          ))}
        </nav>
        {catalog.isPending ? (
          <div role="status">
            <span>카탈로그 불러오는 중…</span>
            <div className={s.grid}>
              {Array.from({ length: 9 }, (_, i) => (
                <div className={s.skeleton} key={i}>
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              ))}
            </div>
          </div>
        ) : catalog.isError ? (
          <div className={s.empty} role="alert">
            <p>{catalog.error.message}</p>
            <Button onClick={() => catalog.refetch()}>카탈로그 재시도</Button>
          </div>
        ) : !items.length ? (
          <div className={s.empty}>등록된 시나리오가 없습니다.</div>
        ) : welcome && !search ? (
          <div className={s.welcome}>
            <h2>질문을 골라 시작하세요</h2>
            <p>
              궁금한 질문을 고르면 필요한 지표와 판정 규칙을 확인할 수 있습니다.
              <br />
              처음이라면 추천 3개부터.
            </p>
            <div className={s.grid}>
              {['S1-3', 'S3-4', 'S8-2'].flatMap((id) =>
                items.find((i) => i.scenario_id === id)
                  ? [card(items.find((i) => i.scenario_id === id)!)]
                  : [],
              )}
            </div>
            <Button variant="ghost" onClick={visit}>
              전체 {items.length}개 질문 보기
            </Button>
          </div>
        ) : (
          <>
            <div className={s.sectionTitle}>
              <h2>
                {search
                  ? '검색 결과'
                  : catalog.data?.categories?.find((c) => c.id === category)?.title}{' '}
                <span>· {shown.length}개 · ★ 추천 상단 고정</span>
              </h2>
              <small>가능 · 부분: 대리 측정 · 준비 중: 확장 필요</small>
            </div>
            {shown.length ? (
              <div className={s.grid}>{shown.map(card)}</div>
            ) : (
              <div className={s.empty}>검색 결과가 없습니다.</div>
            )}
            {!search && category === 'cost' && (
              <>
                <div className={s.sectionTitle}>
                  <h2>
                    사용 패턴·시간대·Rate Limit <span>· 이어서</span>
                  </h2>
                  <Button variant="ghost" onClick={() => setCategory('usage_pattern')}>
                    카테고리 열기 →
                  </Button>
                </div>
                <div className={s.grid}>
                  {sorted(items.filter((i) => i.category === 'usage_pattern')).map(card)}
                </div>
              </>
            )}
          </>
        )}
      </section>
      <aside className={s.aside}>
        <section>
          <h2>
            최근 실행 <small>현재 로그인 세션</small>
          </h2>
          {runs.entries.length ? (
            [
              ...runs.entries.filter((e) => activeRun(e.run)),
              ...runs.entries.filter((e) => !activeRun(e.run)).slice(0, 8),
            ].map((e) => (
              <button
                className={s.recent}
                key={e.run.run_id}
                onClick={() => {
                  setSelected(e.run.scenario_id!);
                  setRunId(e.run.run_id!);
                }}
              >
                <span>
                  <code>{e.run.scenario_id}</code>{' '}
                  {items.find((i) => i.scenario_id === e.run.scenario_id)?.title}
                </span>
                <Badge
                  tone={
                    e.run.status === 'failed'
                      ? 'red'
                      : e.run.status === 'succeeded'
                        ? 'green'
                        : 'blue'
                  }
                >
                  {statusLabel[e.run.status!]}
                </Badge>
                <small>{e.run.params_summary}</small>
                {e.error && <small>상태 확인 필요</small>}
              </button>
            ))
          ) : (
            <p>아직 실행한 질문이 없습니다.</p>
          )}
        </section>
        <section>
          <h2>저장된 리포트</h2>
          <p>결과 저장과 이력 조회는 다음 단계에서 제공됩니다.</p>
        </section>
        {mockMode && <Link to="/dev/api">API 상태 검증 도구</Link>}
      </aside>
      {selected && (
        <Drawer
          key={`${selected}:${runId || 'form'}`}
          id={selected}
          entry={current}
          close={() => {
            setSelected(null);
            setRunId(null);
          }}
          onRun={(id) => setRunId(id)}
          ready={!!options.data}
        />
      )}
    </div>
  );
}
function Drawer({
  id,
  entry,
  close,
  onRun,
  ready,
}: {
  id: string;
  entry?: RunEntry;
  close: () => void;
  onRun: (id: string) => void;
  ready: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    runs = useRuns();
  const detail = useQuery({
    queryKey: ['scenario', id],
    queryFn: ({ signal }) => scenarioApi.detail(id, signal),
  });
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      before?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={s.drawer}
      onCancel={(e) => {
        e.preventDefault();
        if (!runs.pending) close();
      }}
      aria-labelledby="scenario-title"
    >
      <header>
        <div>
          <div className={s.tags}>
            <code>{id}</code>
            {detail.data && (
              <>
                <Availability value={detail.data.availability} />
                <b>{detail.data.target_page}</b>
              </>
            )}
          </div>
          <h2 id="scenario-title">{detail.data?.title || '시나리오 불러오는 중…'}</h2>
          <p>{detail.data?.situation}</p>
        </div>
        <Button aria-label="드로어 닫기" disabled={runs.pending} onClick={close}>
          ×
        </Button>
      </header>
      {detail.isError ? (
        <div className={s.body} role="alert">
          <p>{detail.error.message}</p>
          <Button onClick={() => detail.refetch()}>상세 재시도</Button>
        </div>
      ) : entry ? (
        <RunView
          entry={entry}
          close={close}
          edit={() => onRun('')}
          retry={async () => {
            onRun(await runs.start(id, entry.input || { params: entry.run.params || {} }));
          }}
        />
      ) : detail.data && ready ? (
        <Params detail={detail.data} onRun={onRun} />
      ) : (
        <p className={s.body} role="status">
          입력 정보를 불러오는 중…
        </p>
      )}
    </dialog>
  );
}
function Params({ detail, onRun }: { detail: Detail; onRun: (id: string) => void }) {
  const { value, options, role } = useScopedFilters(),
    runs = useRuns();
  const schema = detail.params_schema as Schema | undefined;
  const initial = () =>
    defaults(schema || {}, {
      from: detail.scenario_id === 'S8-2' ? 'now-90d' : value.from,
      to: value.to,
      team_ids: value.filters?.team_ids,
      models: value.filters?.models,
    });
  const [params, setParams] = useState(initial),
    [error, setError] = useState(''),
    [requestId, setRequestId] = useState('');
  const change = (key: string, v: unknown) => setParams((p) => ({ ...p, [key]: v }));
  const unavailable = detail.availability === 'unavailable',
    restricted =
      role === 'admin' && (detail.target_page === 'P3' || detail.metric_ids?.includes('refusals'));
  const errors = schema ? validateParams(schema, params) : ['파라미터 스키마가 없습니다.'];
  async function submit() {
    if (errors.length) return;
    setError('');
    setRequestId('');
    try {
      onRun(
        await runs.start(detail.scenario_id, {
          params,
          price_basis: value.price_basis,
          tz: value.tz,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError) setRequestId(e.requestId || '');
    }
  }
  const teams = options.data?.teams || [];
  return (
    <>
      <div className={s.body}>
        {(unavailable || restricted) && (
          <div className={s.notice}>
            <h3>
              {restricted ? 'owner 권한이 필요합니다.' : '이 시나리오는 아직 실행할 수 없습니다.'}
            </h3>
            <p>
              {detail.unavailable_reason || '현재 수집 정책과 어댑터의 지원 범위를 확인하세요.'}
            </p>
            <Link to="/settings">설정 · 수집 정책 보기</Link>
          </div>
        )}
        <h3>이 질문에 답하는 지표</h3>
        <div className={s.metrics}>
          {detail.metrics?.map((m, i) => (
            <div key={i}>
              <code>{m.metric_id}</code>
              <span>
                {m.definition}
                {m.caveat && <small>{m.caveat}</small>}
              </span>
              <Availability value={m.availability || detail.availability} />
            </div>
          ))}
        </div>
        {!unavailable && !restricted && (
          <form
            id="scenario-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <fieldset disabled={runs.pending}>
              <legend>분석 조건</legend>
              {'from' in params && (
                <div className={s.period}>
                  <h3>
                    기간 <small>· 기본 = 현재 전역 필터</small>
                  </h3>
                  <div className={s.tags}>
                    {['24h', '7d', '28d', '90d'].map((v) => (
                      <Button
                        key={v}
                        aria-pressed={params.from === `now-${v}`}
                        onClick={() => setParams((p) => ({ ...p, from: `now-${v}`, to: 'now' }))}
                      >
                        {v}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {'from' in params && 'to' in params && (
                <details className={s.customPeriod}>
                  <summary>
                    {String(params.from)} → {String(params.to)} · 기간 직접 입력
                  </summary>
                  <div className={s.fields}>
                    {['from', 'to'].map((key) => (
                      <label key={key}>
                        {labels[key]}
                        <input
                          value={String(params[key])}
                          onChange={(e) => change(key, e.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                </details>
              )}
              <div className={s.fields}>
                {Object.entries(schema?.properties || {}).map(([key, p]) => {
                  if ((key === 'from' || key === 'to') && 'from' in params && 'to' in params)
                    return null;
                  if (key === 'team_ids')
                    return (
                      <fieldset className={s.full} key={key}>
                        <legend>
                          팀{' '}
                          <small>{role === 'admin' ? '· 소속 팀 범위' : '· 비워두면 전사'}</small>
                        </legend>
                        <div className={s.tags}>
                          {teams.map((t) => (
                            <label className={s.team} key={t.team_id}>
                              <input
                                type="checkbox"
                                checked={((params[key] as string[]) || []).includes(t.team_id!)}
                                onChange={(e) =>
                                  change(
                                    key,
                                    e.target.checked
                                      ? [...(params[key] as string[]), t.team_id!]
                                      : (params[key] as string[]).filter((v) => v !== t.team_id),
                                  )
                                }
                              />
                              {t.name}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    );
                  if (key === 'budget_by_team')
                    return (
                      <div className={s.full} key={key}>
                        <h3>
                          예산표 <small>· 팀별 월 예산</small>
                        </h3>
                        <p>USD 또는 토큰(M) 한쪽만 입력</p>
                        <table className={s.budget}>
                          <thead>
                            <tr>
                              <th>팀</th>
                              <th>USD / 월</th>
                              <th>토큰 M / 월</th>
                            </tr>
                          </thead>
                          <tbody>
                            {teams.map((t) => (
                              <tr key={t.team_id}>
                                <th>{t.name}</th>
                                {['usd', 'tokens_m'].map((unit) => (
                                  <td key={unit}>
                                    <input
                                      type="number"
                                      aria-label={`${t.name} ${unit}`}
                                      min="0.000001"
                                      step="any"
                                      value={
                                        (params[key] as Record<string, Record<string, number>>)[
                                          t.team_id!
                                        ]?.[unit] ?? ''
                                      }
                                      onChange={(e) => {
                                        const budget = structuredClone(
                                          params[key] as Record<string, Record<string, number>>,
                                        );
                                        const row = (budget[t.team_id!] ||= {});
                                        if (e.target.value === '') delete row[unit];
                                        else row[unit] = Number(e.target.value);
                                        if (!Object.keys(row).length) delete budget[t.team_id!];
                                        change(key, budget);
                                      }}
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <small>소진률은 실행 결과에서 계산됩니다.</small>
                      </div>
                    );
                  return (
                    <label
                      key={key}
                      className={p.type === 'array' || p.type === 'object' ? s.full : ''}
                    >
                      {p.title || labels[key] || key}
                      {p.enum ? (
                        <select
                          value={String(params[key] ?? '')}
                          onChange={(e) =>
                            change(
                              key,
                              p.enum!.find((v) => String(v) === e.target.value),
                            )
                          }
                        >
                          {p.enum.map((v) => (
                            <option key={String(v)} value={String(v)}>
                              {String(v)}
                            </option>
                          ))}
                        </select>
                      ) : p.type === 'boolean' ? (
                        <input
                          type="checkbox"
                          checked={params[key] === true}
                          onChange={(e) => change(key, e.target.checked)}
                        />
                      ) : p.type === 'object' ? (
                        <JsonInput value={params[key]} change={(v) => change(key, v)} />
                      ) : (
                        <input
                          type={
                            p.type === 'number' || p.type === 'integer'
                              ? 'number'
                              : p.format === 'date'
                                ? 'date'
                                : 'text'
                          }
                          value={
                            Array.isArray(params[key])
                              ? (params[key] as unknown[]).join(', ')
                              : String(params[key] ?? '')
                          }
                          min={p.minimum}
                          max={p.maximum}
                          step={p.type === 'integer' ? 1 : 'any'}
                          onChange={(e) =>
                            change(
                              key,
                              p.type === 'number' || p.type === 'integer'
                                ? e.target.value === ''
                                  ? ''
                                  : Number(e.target.value)
                                : p.type === 'array'
                                  ? e.target.value
                                      .split(',')
                                      .map((v) => v.trim())
                                      .filter(Boolean)
                                      .map((v) => (p.items?.type === 'number' ? Number(v) : v))
                                  : e.target.value,
                            )
                          }
                        />
                      )}
                      <small>
                        {p.description || (p.type === 'array' ? '쉼표로 구분하여 입력' : '')}
                      </small>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div className={s.notice}>
              {detail.findings_rules?.map((r, i) => (
                <p key={i}>{r.message}</p>
              ))}
            </div>
            {errors.length > 0 && <p className={s.validation}>{errors.join(' ')}</p>}
          </form>
        )}
        {error && (
          <div role="alert" className={s.failure}>
            <p>{error}</p>
            {requestId && <code>request_id: {requestId}</code>}
          </div>
        )}
      </div>
      {!unavailable && !restricted && (
        <footer>
          <Button
            variant="primary"
            type="submit"
            form="scenario-form"
            disabled={runs.pending || !!errors.length}
          >
            {runs.pending ? '실행 요청 중…' : '실행'}
          </Button>
          <Button
            disabled={runs.pending}
            onClick={() => {
              setParams(initial());
              setError('');
            }}
          >
            기본값으로
          </Button>
          <small>분석 지표 {detail.metric_ids?.length ?? '—'}개</small>
        </footer>
      )}
    </>
  );
}
function JsonInput({ value, change }: { value: unknown; change: (v: unknown) => void }) {
  const [text, setText] = useState(JSON.stringify(value));
  return (
    <textarea
      aria-label="JSON 입력"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        try {
          change(JSON.parse(e.target.value));
        } catch {
          change(null);
        }
      }}
    />
  );
}
function RunView({
  entry,
  close,
  edit,
  retry,
}: {
  entry: RunEntry;
  close: () => void;
  edit: () => void;
  retry: () => Promise<void>;
}) {
  const runs = useRuns(),
    r = entry.run;
  const [retryError, setRetryError] = useState('');
  const stage =
    r.status === 'succeeded'
      ? 3
      : r.status === 'cancelled'
        ? -1
        : r.status === 'queued'
          ? 0
          : r.progress?.label?.includes('판정')
            ? 2
            : 1;
  return (
    <div className={s.runBody}>
      <div aria-live="polite">
        {retryError && (
          <p role="alert" className={s.failure}>
            {retryError}
          </p>
        )}
        <h3>
          {statusLabel[r.status!]} · {r.scenario_id}
        </h3>
        {r.status === 'failed' && (
          <div className={s.failure} role="alert">
            <strong>{r.error?.message || '분석 실행에 실패했습니다.'}</strong>
            {r.error?.request_id && <code>request_id: {r.error.request_id}</code>}
          </div>
        )}
        {entry.error && (
          <div className={s.failure} role="alert">
            <p>상태 확인 필요: {entry.error}</p>
            <Button disabled={entry.busy} onClick={() => runs.refresh(r.run_id!)}>
              상태 재확인
            </Button>
          </div>
        )}
        <ol className={s.steps}>
          {['대기', '쿼리 실행', '판정', '완료'].map((text, i) => (
            <li key={text} data-active={i <= stage}>
              <span>{r.status === 'succeeded' ? '✓' : i + 1}</span>
              <div>
                {text}
                {i === 1 && (
                  <small>
                    {r.progress?.label} {r.progress?.step ?? '—'}/{r.progress?.total ?? '—'}
                  </small>
                )}
              </div>
            </li>
          ))}
        </ol>
        {activeRun(r) && (
          <progress
            aria-label="분석 진행"
            max={r.progress?.total || 4}
            value={r.progress?.step || 0}
          />
        )}
        <p className={s.notice}>{r.params_summary}</p>
        {r.status === 'succeeded' && (
          <div className={s.notice}>
            <h3>분석이 완료되었습니다.</h3>
            <p>결과 상세·위젯 강조·리포트 저장은 7단계에서 연결됩니다.</p>
          </div>
        )}
      </div>
      <div className={s.tags}>
        {activeRun(r) ? (
          <>
            <Button disabled={entry.busy} onClick={() => runs.cancel(r.run_id!)}>
              실행 취소
            </Button>
            <Button variant="ghost" onClick={close}>
              백그라운드로 두기
            </Button>
          </>
        ) : (
          <>
            <Button onClick={edit}>파라미터 수정</Button>
            {r.status === 'failed' && (
              <Button
                disabled={runs.pending}
                onClick={() => {
                  setRetryError('');
                  void retry().catch((e) => setRetryError((e as Error).message));
                }}
              >
                재실행
              </Button>
            )}
            <Button onClick={close}>닫기</Button>
          </>
        )}
      </div>
      <small className={s.runFoot}>
        실행 중에는 서버 권장 간격으로 상태 갱신 · run_id <code>{r.run_id}</code>
      </small>
    </div>
  );
}
