import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { opsApi, type Members, type Manifests } from '../../api/operations';
import { useScopedFilters } from '../../app/filterContext';
import { useAuth } from '../../app/auth';
import { Button, Badge, WidgetCard, WidgetState } from '../../components/ui';
import { Widget, Result, q } from '../../widgets/Widget';
import { format, number } from '../../widgets/model';
import { AuditDialog, State, Table, Pager, dateTime } from '../operations/shared';
import s from '../operations/Operations.module.css';
function deploymentLabel(active: NonNullable<Manifests['active']>) {
  if (active.applied_installations === undefined || active.assigned_installations === undefined)
    return '배포 상태 미관측';
  return active.applied_installations === active.assigned_installations ? '배포 완료' : '배포 진행';
}
export function PolicyCard({ compact = false }: { compact?: boolean }) {
  const { profile } = useAuth();
  const query = useQuery({
    queryKey: ['settings', 'manifest', profile?.role],
    queryFn: ({ signal }) => opsApi.manifests(signal),
  });
  return (
    <WidgetCard
      title={compact ? '수집 정책 배포 상태' : '활성 manifest'}
      action={compact ? <Link to="/settings#policy">설정 › 수집 정책</Link> : undefined}
      caption="신호 설정은 조회 전용 · 배포 간격/프라이버시 상세는 API 미제공"
    >
      <State query={query}>
        {(d) =>
          d.active ? (
            compact ? (
              <div className={s.compactPolicy}>
                <div>
                  <small>활성 manifest</small>
                  <p>v{d.active.version ?? '—'}</p>
                  <Badge
                    tone={
                      d.active.applied_installations !== undefined &&
                      d.active.applied_installations === d.active.assigned_installations
                        ? 'green'
                        : 'orange'
                    }
                  >
                    {deploymentLabel(d.active)}
                  </Badge>
                  <small>{dateTime(d.active.activated_at)}</small>
                </div>
                <div>
                  <p>
                    적용 {d.active.applied_installations ?? '—'} /{' '}
                    {d.active.assigned_installations ?? '—'} 설치
                  </p>
                  <progress
                    max={d.active.assigned_installations || 1}
                    value={d.active.applied_installations || 0}
                  />
                  <small>버전별 잔존 설치 수는 API 미제공</small>
                </div>
                <div className={s.full}>
                  {Object.entries(d.active.signals || {}).map(([k, v]) => (
                    <Badge key={k} tone={v ? 'blue' : 'gray'}>
                      {k} {v ? 'ON' : 'OFF'}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <strong className={s.stat}>v{d.active.version ?? '—'}</strong>
                <Badge
                  tone={
                    d.active.applied_installations !== undefined &&
                    d.active.applied_installations === d.active.assigned_installations
                      ? 'green'
                      : 'orange'
                  }
                >
                  {deploymentLabel(d.active)}
                </Badge>
                <Table
                  headers={['항목', '값']}
                  rows={[
                    ['게시', dateTime(d.active.activated_at)],
                    [
                      '적용 설치',
                      `${d.active.applied_installations ?? '—'} / ${d.active.assigned_installations ?? '—'}`,
                    ],
                    [
                      '미적용',
                      d.active.assigned_installations !== undefined &&
                      d.active.applied_installations !== undefined
                        ? d.active.assigned_installations - d.active.applied_installations
                        : '—',
                    ],
                  ]}
                />
                <progress
                  max={d.active.assigned_installations || 1}
                  value={d.active.applied_installations || 0}
                />
                <div className={s.inline}>
                  {Object.entries(d.active.signals || {}).map(([k, v]) => (
                    <Badge key={k} tone={v ? 'blue' : 'gray'}>
                      {k} {v ? 'ON' : 'OFF'}
                    </Badge>
                  ))}
                </div>
              </>
            )
          ) : (
            <WidgetState status="empty" />
          )
        }
      </State>
    </WidgetCard>
  );
}
function MemberList() {
  const scope = useScopedFilters();
  const [modal, setModal] = useState(false),
    [data, setData] = useState<Members>(),
    [reason, setReason] = useState(''),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [cursors, setCursors] = useState<string[]>([]),
    [search, setSearch] = useState('');
  const controller = useRef<AbortController | null>(null);
  const gen = useRef(0);
  useEffect(
    () => () => {
      gen.current++;
      controller.current?.abort();
    },
    [],
  );
  function close() {
    gen.current++;
    controller.current?.abort();
    setData(undefined);
    setReason('');
    setPending(false);
    setError('');
    setSearch('');
    setCursors([]);
  }
  async function run(why: string, history: string[] = []) {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    const n = ++gen.current;
    setData(undefined);
    setReason('');
    setPending(true);
    setError('');
    setModal(false);
    try {
      const result = await opsApi.members(
        new URLSearchParams({ limit: '8', ...(history.length ? { cursor: history.at(-1)! } : {}) }),
        why,
        c.signal,
      );
      if (n === gen.current) {
        setData(result);
        setReason(why);
        setCursors(history);
      }
    } catch (e) {
      if (n === gen.current && !c.signal.aborted) setError((e as Error).message);
    } finally {
      if (n === gen.current) setPending(false);
    }
  }
  return (
    <WidgetCard
      title="구성원"
      action={
        data ? (
          <input
            aria-label="현재 페이지 이메일 검색"
            placeholder="현재 페이지 이메일 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        ) : undefined
      }
      caption="owner 전용 · 전체 이메일은 감사 사유 입력 후 조회 · 검색은 현재 페이지에 적용"
    >
      {modal && (
        <AuditDialog
          target="구성원 목록 · 이메일"
          onCancel={() => setModal(false)}
          onSubmit={run}
        />
      )}
      {pending ? (
        <>
          <WidgetState status="loading" />
          <Button onClick={close}>조회 취소</Button>
        </>
      ) : error ? (
        <div role="alert">
          <p>{error}</p>
          <Button onClick={() => setModal(true)}>사유 입력 후 재시도</Button>
        </div>
      ) : data ? (
        <>
          <Table
            headers={['이메일', '팀', '역할', '상태', '설치 수']}
            rows={(data.items || [])
              .filter((m) => m.email?.toLowerCase().includes(search.toLowerCase()))
              .map((m) => [
                <code>{m.email}</code>,
                m.team_ids
                  ?.map(
                    (id) => scope.options.data?.teams?.find((t) => t.team_id === id)?.name || id,
                  )
                  .join(', '),
                <Badge>{m.role}</Badge>,
                m.status,
                m.installation_count,
              ])}
          />
          <div className={s.inline}>
            <small>
              {data.total ?? '—'}명 중 {data.items?.length ?? 0}명 조회
            </small>
            <Pager
              hasNext={!!data.next_cursor}
              hasPrevious={!!cursors.length}
              next={() => run(reason, [...cursors, data.next_cursor!])}
              previous={() => run(reason, cursors.slice(0, -1))}
            />
            <Button size={26} onClick={close}>
              조회 종료
            </Button>
          </div>
        </>
      ) : (
        <div className={s.memberGate}>
          <p>구성원 이메일을 조회하려면 사유를 입력하세요.</p>
          <Button onClick={() => setModal(true)}>구성원 조회 · 사유 입력</Button>
        </div>
      )}
    </WidgetCard>
  );
}
export function Settings() {
  const { profile } = useAuth();
  const contracts = useQuery({
    queryKey: ['settings', 'contracts', profile?.role],
    queryFn: ({ signal }) => opsApi.contracts(signal),
  });
  const teams = useQuery({
    queryKey: ['settings', 'teams', profile?.role],
    queryFn: ({ signal }) => opsApi.teams(signal),
  });
  const manifests = useQuery({
    queryKey: ['settings', 'manifest', profile?.role],
    queryFn: ({ signal }) => opsApi.manifests(signal),
  });
  return (
    <div className={s.settings}>
      <section id="contracts">
        <header className={s.sectionTitle}>
          <h2>계약 · 단가</h2>
          <span>계약 단가는 계약 금액 체계에 반영 · 청구액 아님</span>
        </header>
        <div className={s.grid}>
          <div className={s.wide}>
            <WidgetCard
              title="계약"
              caption="discount_rate는 공시 단가에 곱하는 배율입니다. 0.8 = 공시 단가의 80% (20% 할인)."
            >
              <State query={contracts}>
                {(d) => (
                  <>
                    <Table
                      headers={['벤더', '유형', '기간', '약정', '상태']}
                      rows={(d.items || []).map((c) => [
                        c.vendor,
                        c.contract_type === 'term_commitment' ? 'Enterprise 약정' : '토큰 할인',
                        `${c.starts_at} → ${c.ends_at || '종료 미정'}`,
                        c.term_commitment?.commitment_amount == null
                          ? '—'
                          : `${c.term_commitment.currency} ${c.term_commitment.commitment_amount.toLocaleString('en-US')}`,
                        <Badge tone={c.status === 'active' ? 'green' : 'gray'}>{c.status}</Badge>,
                      ])}
                    />
                    <h3 className={s.subTitle}>토큰 할인 · 계약별 적용 배율</h3>
                    <Table
                      headers={['계약 / model_pattern', 'token_type', '공시 대비 배율', '유효기간']}
                      rows={(d.items || []).flatMap((c) =>
                        (c.token_discounts || []).map((t) => [
                          <>
                            <small>{c.name}</small>
                            <code>{t.model_pattern || '전체 모델'}</code>
                          </>,
                          t.token_type,
                          t.discount_rate == null
                            ? '—'
                            : `${(t.discount_rate * 100).toFixed(0)}% (×${t.discount_rate})`,
                          `${t.effective_from} → ${t.effective_to || '종료 미정'}`,
                        ]),
                      )}
                    />
                  </>
                )}
              </State>
            </WidgetCard>
          </div>
          <div className={s.narrow}>
            {profile?.role !== 'owner' ? (
              <WidgetCard title="약정 소진률">
                <p>전사 약정 소진률은 owner에게 제공됩니다.</p>
              </WidgetCard>
            ) : (
              <State query={contracts}>
                {(contractsData) => {
                  const contract = contractsData.items?.find(
                    (c) => c.status === 'active' && c.contract_type === 'term_commitment',
                  );
                  return contract?.starts_at ? (
                    <Widget
                      id="settings-burn"
                      title="약정 소진률"
                      subtitle="계약 단가 기준"
                      definition="활성 약정 계약의 누적 계약 단가 비용 ÷ 약정액"
                      caption="예상 소진일은 API 미제공 · 청구액 아님"
                      requestPatch={{
                        from: contract.starts_at,
                        to: 'now',
                        price_basis: 'contract',
                        filters: { team_ids: [], products: [], models: [] },
                        compare: 'none',
                      }}
                      queries={[
                        q('contract_commitment_burn', 'scalar', {
                          params: { contract_id: contract.contract_id },
                        }),
                      ]}
                    >
                      {(d, r) => (
                        <Result result={d.A} title="약정 소진률" retry={r}>
                          {(p) => {
                            const v = p.find((p) => p.unit === 'ratio');
                            return (
                              <>
                                <div
                                  className={s.gauge}
                                  style={{
                                    background: `conic-gradient(from 270deg at 50% 100%,var(--accent-purple) ${Math.max(0, Math.min(1, number(v?.value) || 0)) * 180}deg,var(--surface-sub) 0deg 180deg, transparent 180deg)`,
                                  }}
                                >
                                  <div>
                                    <strong>{format(v?.value, 'ratio')}%</strong>
                                    <small>소진</small>
                                  </div>
                                </div>
                                <Table
                                  headers={['항목', '값']}
                                  rows={p
                                    .filter((v) => v.unit !== 'ratio')
                                    .map((v) => [
                                      v.key === 'cost_usd'
                                        ? '소진'
                                        : v.key === 'commitment_amount'
                                          ? '약정'
                                          : v.key,
                                      format(v.value, v.unit),
                                    ])}
                                />
                              </>
                            );
                          }}
                        </Result>
                      )}
                    </Widget>
                  ) : (
                    <WidgetCard title="약정 소진률">
                      <WidgetState status="empty" />
                    </WidgetCard>
                  );
                }}
              </State>
            )}
          </div>
        </div>
      </section>
      <section id="members">
        <header className={s.sectionTitle}>
          <h2>팀 · 구성원</h2>
          <span>조회 전용 · 편집은 enrollment 관리 API에서</span>
        </header>
        <div className={s.membersGrid}>
          <WidgetCard title="팀" caption="접근 가능한 팀 · 활성 설치 수는 팀 메타 API 미제공">
            <State query={teams}>
              {(d) => (
                <Table
                  headers={['이름', '상태', '현재 인원']}
                  rows={(d.items || []).map((t) => [
                    t.name,
                    <Badge>{t.status}</Badge>,
                    t.member_count,
                  ])}
                />
              )}
            </State>
          </WidgetCard>
          {profile?.role === 'owner' ? (
            <MemberList />
          ) : (
            <WidgetCard title="구성원">
              <p>구성원 이메일 목록은 owner 권한으로 제공됩니다.</p>
            </WidgetCard>
          )}
        </div>
      </section>
      <section id="policy">
        <header className={s.sectionTitle}>
          <h2>수집 정책</h2>
          <span>활성 manifest의 OpenTelemetry 신호 설정</span>
        </header>
        <div className={s.grid}>
          <div className={s.narrow}>
            <PolicyCard />
          </div>
          <div className={s.wide}>
            <WidgetCard
              title="signals"
              caption="수집 항목·프라이버시 옵션은 현재 API 미제공 · 세션 조회는 프롬프트 본문을 표시하지 않음"
            >
              <State query={manifests}>
                {(d) =>
                  d.active ? (
                    <>
                      <Table
                        headers={['signal', '상태', '적용 설치', '프라이버시 옵션']}
                        rows={Object.entries(d.active.signals || {}).map(([k, v]) => [
                          <code>{k}</code>,
                          <Badge tone={v ? 'blue' : 'gray'}>{v ? 'ON' : 'OFF'}</Badge>,
                          `${d.active?.applied_installations ?? '—'} / ${d.active?.assigned_installations ?? '—'}`,
                          'API 미제공',
                        ])}
                      />
                      <h3 className={s.subTitle}>배포 이력</h3>
                      <Table
                        headers={['버전', '생성 시각', '상태']}
                        rows={(d.history || []).map((h) => [
                          `v${h.version}`,
                          dateTime(h.created_at),
                          h.is_active ? '활성' : '이전 버전',
                        ])}
                      />
                    </>
                  ) : (
                    <WidgetState status="empty" />
                  )
                }
              </State>
            </WidgetCard>
          </div>
        </div>
      </section>
    </div>
  );
}
