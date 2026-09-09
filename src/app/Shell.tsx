import { RunProvider } from '../pages/scenarios/RunProvider';
import { ScenarioHeader } from '../pages/scenarios/Scenarios';
import { OverviewCsv } from '../pages/overview/OverviewCsv';
import { series } from '../widgets/model';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button } from '../components/ui';
import { api, mockMode } from '../api/client';
import type { FilterOptions, QueryResponse } from '../api/types';
import { useAuth } from './auth';
import { presets, type Filters } from './filters';
import s from './Shell.module.css';
import { FilterProvider, useScopedFilters } from './filterContext';
export const pages = [
  { path: '/', name: '개요', phase: 4 },
  { path: '/teams', name: '팀 분석', phase: 2 },
  { path: '/operations', name: '운영 · 보안', phase: 5 },
  { path: '/scenarios', name: '시나리오', phase: 6 },
  { path: '/settings', name: '설정', phase: 5 },
];
export function Login() {
  const { profile, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState('');
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const target = (location.state as { from?: string } | null)?.from;
  if (profile)
    return (
      <Navigate
        to={
          target?.startsWith('/') && !target.startsWith('//') && !target.startsWith('/login')
            ? target
            : '/'
        }
        replace
      />
    );
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await login(email, password);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <main className={s.login}>
      <form onSubmit={submit}>
        <div className={s.logo} />
        <h1>Pulsemetry</h1>
        <p>관리자 콘솔에 로그인하세요.</p>
        {mockMode && (
          <aside>
            <Badge tone="blue">목업 모드</Badge>
            <p>테스트 계정으로 콘솔을 둘러보세요.</p>
            <div className={s.inline}>
              {['owner', 'admin'].map((role) => (
                <Button
                  key={role}
                  onClick={() => {
                    setEmail(`${role}@pulsemetry.test`);
                    setPassword('demo-pulse');
                  }}
                >
                  {role} 계정 입력
                </Button>
              ))}
            </div>
            <small>비밀번호: demo-pulse · 실제 계정 정보를 입력하지 마세요.</small>
          </aside>
        )}
        <label>
          이메일
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          비밀번호
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <Button variant="primary" type="submit" disabled={pending}>
          {pending ? '로그인 중…' : '로그인'}
        </Button>
        <small>로그인 상태는 현재 탭의 메모리에만 보관됩니다.</small>
      </form>
    </main>
  );
}
export function Shell() {
  const { profile, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState(() =>
    localStorage.getItem('pulsemetry.theme') === 'dark' ? 'dark' : 'light',
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('pulsemetry.theme', theme);
  }, [theme]);
  if (!profile)
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  return (
    <div className={`${s.shell} ${collapsed ? s.collapsed : ''}`}>
      <a href="#page-content" className={s.skip}>
        본문으로 이동
      </a>
      <aside className={s.sidebar} aria-label="주 내비게이션">
        <div className={s.brand}>
          <Link to={'/' + location.search} aria-label="Pulsemetry 개요">
            <span className={s.logo} />
            <span className={s.navText}>Pulsemetry</span>
          </Link>
          <button
            className={s.collapse}
            aria-label={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>
        <nav>
          {pages
            .filter((p) => p.path !== '/operations' || profile.role === 'owner')
            .map((page, i) => (
              <NavLink
                key={page.path}
                to={page.path + location.search}
                end={page.path === '/'}
                aria-label={page.name}
                title={page.name}
                className={({ isActive }) => `${s.navItem} ${isActive ? s.active : ''}`}
              >
                <span className={s.navGlyph} data-shape={i} />
                <span className={s.navText}>{page.name}</span>
              </NavLink>
            ))}
        </nav>
        <div className={s.account}>
          <div className={s.navText}>
            <p>{profile.tenant?.name}</p>
            <p className={s.email}>{profile.email}</p>
            <Badge>
              {profile.role}
              {profile.role === 'admin' ? ' · 소속 부서' : ''}
            </Badge>
          </div>
          <div className={s.theme} role="group" aria-label="테마">
            {['light', 'dark'].map((t) => (
              <button
                key={t}
                aria-label={t === 'light' ? '라이트' : '다크'}
                aria-pressed={theme === t}
                onClick={() => setTheme(t)}
              >
                {t === 'light' ? '라이트' : '다크'}
              </button>
            ))}
          </div>
          <Button variant="ghost" onClick={logout} aria-label="로그아웃">
            나가기
          </Button>
          {mockMode && <span className={s.mockLabel}>목업</span>}
        </div>
      </aside>
      <FilterProvider>
        <RunProvider key={profile.member_id}>
          <div className={s.workspace}>
            <GlobalHeader />
            <main id="page-content" className={s.content} tabIndex={-1}>
              <Outlet />
            </main>
          </div>
        </RunProvider>
      </FilterProvider>
    </div>
  );
}
function GlobalHeader() {
  const location = useLocation();
  const { profile } = useAuth();
  const { value, serialized, options, auto, setAuto, update } = useScopedFilters();
  const cache = useQueryClient();
  const [details, setDetails] = useState(false);
  const coverage = useQuery({
    queryKey: ['widget', 'coverage', profile?.role, serialized],
    queryFn: ({ signal }) =>
      api.query(
        {
          ...value,
          queries: [{ ref_id: 'A', metric_id: 'telemetry_coverage', frame_type: 'scalar' }],
        },
        signal,
      ),
    enabled: !!options.data,
    refetchInterval: auto ? 300000 : false,
  });
  async function refresh() {
    await cache.invalidateQueries({ queryKey: ['filters'] });
    await cache.invalidateQueries({ queryKey: ['widget'] });
  }
  return (
    <>
      {location.pathname === '/scenarios' ? (
        <ScenarioHeader />
      ) : location.pathname === '/settings' ? (
        <div className={s.settingsBar}>
          <h1>설정</h1>
          <a href="#contracts">계약 · 단가</a>
          <a href="#members">팀 · 구성원</a>
          <a href="#policy">수집 정책</a>
          <small>조회 전용 · 편집은 enrollment 관리 API에서</small>
        </div>
      ) : (
        <div className={s.toolbar}>
          <div className={s.inline}>
            <Segment
              label="기간"
              values={presets.map((p) => [p, p.replace('now-', '')])}
              value={value.to === 'now' ? value.from : ''}
              onChange={(from) => update({ from, to: 'now' })}
            />
            <DateRange value={value} data={coverage.data} onChange={update} />
            <label className={s.inline}>
              비교
              <select
                aria-label="비교 기간"
                value={value.compare}
                onChange={(e) => update({ compare: e.target.value as Filters['compare'] })}
              >
                <option value="none">없음</option>
                <option value="previous_period">직전 기간</option>
                <option value="previous_week">전주</option>
              </select>
            </label>
            <small>KST</small>
          </div>
          <div className={s.inline}>
            <FilterSelect
              options={options.data}
              value={value}
              onChange={update}
              disabled={!options.data}
            />
            <Segment
              label="단가"
              values={[
                ['list', '공시'],
                ['contract', '계약'],
              ]}
              value={value.price_basis!}
              onChange={(v) => update({ price_basis: v as Filters['price_basis'] })}
            />
          </div>
          <div className={s.actions}>
            <Link className={s.question} to={'/scenarios?' + serialized}>
              답할 수 있는 질문
            </Link>
            <div className={s.refresh}>
              <button onClick={refresh} disabled={coverage.isFetching} aria-label="새로고침">
                새로고침
              </button>
              <label>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="5분 자동 새로고침"
                  checked={auto}
                  onChange={(e) => setAuto(e.target.checked)}
                />
                5분
              </label>
            </div>
            {location.pathname === '/' ? (
              <OverviewCsv />
            ) : (
              <Button disabled title="현재 페이지의 CSV는 제공되지 않습니다">
                CSV
              </Button>
            )}
          </div>
        </div>
      )}
      {options.isError && (
        <div className={s.notice} role="alert">
          필터를 불러오지 못했습니다. <Button onClick={() => options.refetch()}>필터 재시도</Button>
        </div>
      )}
      <div className={s.coverage} role="status" aria-label="텔레메트리 커버리지">
        <span className={s.dot} />
        {coverage.isPending ? (
          '커버리지를 불러오는 중…'
        ) : coverage.isError || coverage.data?.results.A?.status !== 200 ? (
          <span>
            커버리지 조회 실패 <button onClick={() => coverage.refetch()}>재시도</button>
          </span>
        ) : series(coverage.data?.results.A).state === 'masked' ? (
          <span>최소 집계 단위 미만 · 활성 설치 / 구성원 / 커버리지 n&lt;5</span>
        ) : (
          <span>
            텔레메트리 활성 기기 기준 · 활성 설치{' '}
            <strong>{coverage.data.coverage?.active_installations ?? '—'}</strong> / 활성 구성원{' '}
            <strong>{coverage.data.coverage?.active_members ?? '—'}</strong> (
            <strong>
              {coverage.data.coverage?.ratio == null
                ? '미관측'
                : `${Math.round(coverage.data.coverage.ratio * 100)}%`}
            </strong>
            ) · 마지막 적재{' '}
            {coverage.data.coverage?.last_ingested_at
              ? new Intl.DateTimeFormat('ko-KR', {
                  timeZone: 'Asia/Seoul',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(coverage.data.coverage.last_ingested_at))
              : '—'}
          </span>
        )}
        <button
          className={s.detailButton}
          aria-expanded={details}
          onClick={() => setDetails(!details)}
        >
          커버리지 상세
        </button>
      </div>
      {details && (
        <section className={s.details}>
          <h2>커버리지 상세</h2>
          <p>활성 설치 수 ÷ 활성 구성원 수입니다. 구성원이 0명이면 비율은 미관측으로 표시합니다.</p>
          <p>필터가 적용된 관측 범위이며 미관측은 미사용을 의미하지 않습니다.</p>
          {mockMode && <p>목업의 기준 시각은 2026-09-07 18:44 KST입니다.</p>}
          <Button onClick={() => setDetails(false)}>닫기</Button>
        </section>
      )}
    </>
  );
}
function Segment({
  label,
  values,
  value,
  onChange,
}: {
  label: string;
  values: string[][];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={s.segment} role="group" aria-label={label}>
      {values.map(([v, title]) => (
        <button key={v} aria-pressed={v === value} onClick={() => onChange(v)}>
          {title}
        </button>
      ))}
    </div>
  );
}
function FilterSelect({
  options,
  value,
  onChange,
  disabled,
}: {
  options?: FilterOptions;
  value: Filters;
  onChange: (p: Partial<Filters>) => void;
  disabled: boolean;
}) {
  const f = value.filters || {};
  return (
    <>
      <select
        aria-label="부서"
        disabled={disabled}
        value={f.team_ids?.length === 1 ? f.team_ids[0] : ''}
        onChange={(e) =>
          onChange({ filters: { ...f, team_ids: e.target.value ? [e.target.value] : [] } })
        }
      >
        <option value="">부서 전체</option>
        {options?.teams?.map((t) => (
          <option key={t.team_id} value={t.team_id}>
            {t.name}
          </option>
        ))}
      </select>
      {(['claude_code', 'codex'] as const).map((product) => {
        const selected = !f.products?.length || f.products.includes(product);
        return (
          <button
            className={s.product}
            key={product}
            disabled={disabled || !options?.products?.includes(product)}
            aria-pressed={selected}
            onClick={() => {
              const current = f.products?.length ? f.products : (['claude_code', 'codex'] as const);
              const next = selected ? current.filter((p) => p !== product) : [...current, product];
              if (next.length)
                onChange({ filters: { ...f, products: next.length === 2 ? [] : next } });
            }}
          >
            <span />
            {product}
          </button>
        );
      })}
      <select
        aria-label="모델"
        disabled={disabled}
        value={f.models?.length === 1 ? f.models[0] : ''}
        onChange={(e) =>
          onChange({ filters: { ...f, models: e.target.value ? [e.target.value] : [] } })
        }
      >
        <option value="">모델 전체</option>
        {options?.models?.map((m) => (
          <option key={m.model} value={m.model}>
            {m.model}
          </option>
        ))}
      </select>
    </>
  );
}
function DateRange({
  value,
  data,
  onChange,
}: {
  value: Filters;
  data?: QueryResponse;
  onChange: (p: Partial<Filters>) => void;
}) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState('');
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const from = `${f.get('from')}T00:00:00+09:00`,
      to = `${f.get('to')}T00:00:00+09:00`;
    if (Date.parse(from) >= Date.parse(to)) return setError('종료일은 시작일 이후여야 합니다.');
    onChange({ from, to });
    setOpen(false);
    setError('');
  }
  const date = (str?: string) =>
    str
      ? new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Seoul',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(str))
      : '';
  return (
    <div className={s.date}>
      <Button onClick={() => setOpen(!open)} aria-expanded={open} aria-label="사용자 지정 기간">
        {data
          ? `${date(data.resolved_from).slice(5)} → ${date(data.resolved_to).slice(5)}`
          : '기간 선택'}
      </Button>
      {open && (
        <form
          className={s.datePanel}
          role="dialog"
          aria-label="기간 설정"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
          onSubmit={submit}
        >
          <label>
            시작일
            <input
              autoFocus
              required
              type="date"
              name="from"
              defaultValue={date(
                data?.resolved_from || (value.from.startsWith('now') ? undefined : value.from),
              )}
            />
          </label>
          <label>
            종료일 (미포함)
            <input required type="date" name="to" defaultValue={date(data?.resolved_to)} />
          </label>
          {error && <p role="alert">{error}</p>}
          <Button type="submit" variant="primary">
            기간 적용
          </Button>
          <Button onClick={() => setOpen(false)}>취소</Button>
        </form>
      )}
    </div>
  );
}
export function PlannedPage() {
  const { profile } = useAuth();
  const location = useLocation();
  const page = pages.find((p) => p.path === location.pathname);
  if (!page)
    return (
      <section className={s.placeholder}>
        <h1>페이지를 찾을 수 없습니다</h1>
        <Link to="/">개요로 돌아가기</Link>
      </section>
    );
  if (page?.path === '/operations' && profile?.role !== 'owner')
    return (
      <section className={s.placeholder}>
        <h1>접근 권한이 없습니다</h1>
        <p>운영 · 보안은 현재 owner 권한으로 제공됩니다.</p>
      </section>
    );
  return (
    <>
      <header className={s.pageTitle}>
        <h1>{page?.name || '페이지를 찾을 수 없습니다'}</h1>
        {mockMode && <Badge tone="blue">목업 모드</Badge>}
      </header>
      <section className={s.placeholder}>
        <Badge>구현 예정</Badge>
        <h2>{page?.name} 화면을 준비하고 있습니다</h2>
        <p>
          {page?.phase}단계에서 지표와 상세 기능이 추가됩니다. 현재 전역 필터와 커버리지 조회를
          사용할 수 있습니다.
        </p>
        <Link to="/dev/components">공통 컴포넌트 보기</Link>
        {mockMode && <Link to="/dev/api">API 상태 검증 도구</Link>}
      </section>
    </>
  );
}
