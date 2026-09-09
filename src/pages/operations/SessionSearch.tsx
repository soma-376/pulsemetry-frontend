import { useEffect, useRef, useState } from 'react';
import {
  opsApi,
  eventDetails,
  durationMs,
  type SessionEvents,
  type Lookup,
} from '../../api/operations';
import { useScopedFilters } from '../../app/filterContext';
import { Button, Badge, WidgetCard, WidgetState } from '../../components/ui';
import { AuditDialog, dateTime, Table, Pager } from './shared';
import s from './Operations.module.css';
export function SessionSearch() {
  const scope = useScopedFilters();
  const [id, setId] = useState(''),
    [lookup, setLookup] = useState<Lookup>('session_id'),
    [modal, setModal] = useState(false),
    [data, setData] = useState<SessionEvents>(),
    [reason, setReason] = useState(''),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false),
    [cursors, setCursors] = useState<string[]>([]);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  function clear() {
    generation.current++;
    controller.current?.abort();
    setData(undefined);
    setReason('');
    setError('');
    setPending(false);
    setCursors([]);
  }
  async function run(why: string, history: string[] = []) {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    const gen = ++generation.current;
    setPending(true);
    setData(undefined);
    setError('');
    setReason('');
    setModal(false);
    try {
      const result = await opsApi.events(
        id.trim(),
        new URLSearchParams({
          lookup,
          from: scope.value.from,
          to: scope.value.to,
          limit: '8',
          ...(history.length ? { cursor: history.at(-1)! } : {}),
        }),
        why,
        c.signal,
      );
      if (gen !== generation.current) return;
      setData(result);
      setReason(why);
      setCursors(history);
    } catch (e) {
      if (gen === generation.current && !c.signal.aborted) setError((e as Error).message);
    } finally {
      if (gen === generation.current) setPending(false);
    }
  }
  const events = data?.items || [];
  const start = events.length ? Math.min(...events.map((e) => Date.parse(e.ts || ''))) : 0;
  const span = Math.max(
    1,
    ...events.map((e) => Date.parse(e.ts || '') - start + (durationMs(e) || 0)),
  );
  return (
    <>
      <WidgetCard
        title="세션 조회(감사)"
        subtitle="모든 조회는 사유와 함께 감사 로그에 기록"
        caption="프롬프트 본문은 표시하지 않음 · 토큰·비용은 llm_call 로그에만 표시 · 선택 기간 적용"
      >
        <form
          className={s.search}
          onSubmit={(e) => {
            e.preventDefault();
            if (id.trim()) {
              clear();
              setModal(true);
            }
          }}
        >
          <select
            aria-label="식별자 유형"
            value={lookup}
            onChange={(e) => {
              clear();
              setLookup(e.target.value as Lookup);
            }}
          >
            {(['session_id', 'request_id', 'call_id', 'installation_id'] as const).map((v) => (
              <option value={v} key={v}>
                {v === 'call_id' ? 'tool_use_id (call_id)' : v}
              </option>
            ))}
          </select>
          <input
            aria-label="세션 식별자"
            required
            maxLength={256}
            placeholder="session_id / request_id / tool_use_id / installation_id"
            value={id}
            onChange={(e) => {
              clear();
              setId(e.target.value);
            }}
          />
          <Button type="submit" variant="primary" size={36} disabled={!id.trim() || pending}>
            조회 · 사유 입력
          </Button>
        </form>
      </WidgetCard>
      {modal && (
        <AuditDialog target={`${lookup}: ${id}`} onCancel={() => setModal(false)} onSubmit={run} />
      )}
      {pending ? (
        <section className={s.empty}>
          <WidgetState status="loading" />
          <Button onClick={clear}>조회 취소</Button>
        </section>
      ) : error ? (
        <section className={s.empty} role="alert">
          <p>{error}</p>
          <Button onClick={() => setModal(true)}>사유 입력 후 재시도</Button>
        </section>
      ) : !data ? (
        <section className={s.empty}>
          <span className={s.circle} />
          <h2>식별자를 입력해 세션을 조회하세요</h2>
          <p>조회 사유(10–500자)를 입력해야 결과가 열립니다.</p>
          <small>
            세션 이벤트는 조회 종료 · 탭 이동 · 필터 변경 때 화면과 메모리에서 제거됩니다.
          </small>
        </section>
      ) : (
        <>
          <div className={s.auditBanner}>
            <span>조회 완료 · 감사 사유: {reason}</span>
            <Button size={26} onClick={clear}>
              조회 종료
            </Button>
          </div>
          <div className={s.sessionGrid}>
            <WidgetCard
              title="세션 메타"
              action={<Badge tone="orange">개인 식별 조회</Badge>}
              caption="서버가 반환한 메타만 표시 · 청구액 아님"
            >
              <Table
                headers={['항목', '값']}
                rows={Object.entries({
                  session_id: data.session?.session_id,
                  '제품 · 버전': [data.session?.product, data.session?.client_version]
                    .filter(Boolean)
                    .join(' '),
                  팀: data.session?.team_ids
                    ?.map(
                      (id) => scope.options.data?.teams?.find((t) => t.team_id === id)?.name || id,
                    )
                    .join(', '),
                  installation_id: data.session?.installation_id,
                  시작: dateTime(data.session?.started_at),
                  종료: dateTime(data.session?.ended_at),
                  '전체 이벤트 수': data.session?.event_count,
                }).map(([k, v]) => [k, v])}
              />
            </WidgetCard>
            <WidgetCard
              title="타임라인"
              subtitle="현재 페이지 · 시간순"
              caption="스팬은 지연만, 토큰·비용은 llm_call 로그 행에만 · API 미제공 사용자/감사 ID는 표시하지 않음"
            >
              {!events.length ? (
                <WidgetState status="empty" />
              ) : (
                <div className={s.timeline}>
                  {events.map((event, i) => {
                    const duration = durationMs(event);
                    const color =
                      event.type === 'api_error'
                        ? 'var(--accent-red)'
                        : event.type === 'tool_gate'
                          ? 'var(--accent-orange)'
                          : event.type === 'tool_execution'
                            ? 'var(--accent-green)'
                            : 'var(--accent-blue)';
                    return (
                      <div key={event.event_id || i} className={s.event}>
                        <div>
                          <code title={eventDetails(event)}>
                            {event.signal === 'span' ? '▪' : '●'} {event.type}
                          </code>
                          <small>{eventDetails(event)}</small>
                          <small>
                            {dateTime(event.ts)}
                            {event.parent_id ? ` · parent ${event.parent_id}` : ''}
                          </small>
                        </div>
                        <div className={s.track} title={`${duration ?? '—'} ms`}>
                          <i
                            style={{
                              left: `${Math.max(0, ((Date.parse(event.ts || '') - start) / span) * 100)}%`,
                              width:
                                event.signal === 'span'
                                  ? `${Math.max(0.5, ((duration || 0) / span) * 100)}%`
                                  : '5px',
                              background: color,
                            }}
                          />
                        </div>
                        <span>{duration == null ? '—' : `${(duration / 1000).toFixed(1)}s`}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className={s.inline}>
                <small>
                  {data.total ?? '—'}건 중 {events.length}건
                </small>
                <Pager
                  hasNext={!!data.next_cursor}
                  hasPrevious={!!cursors.length}
                  next={() => run(reason, [...cursors, data.next_cursor!])}
                  previous={() => run(reason, cursors.slice(0, -1))}
                />
              </div>
            </WidgetCard>
          </div>
        </>
      )}
    </>
  );
}
