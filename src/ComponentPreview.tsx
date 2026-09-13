import { useEffect, useState, type CSSProperties } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Tabs from '@radix-ui/react-tabs';
import { Badge, Button, KpiCard, WidgetCard, WidgetState, type Tone, type WidgetStatus } from './components/ui';
import variables from '../docs/reference/figma-variables.json';
import s from './App.module.css';

const semantics: { tone: Tone; title: string; description: string }[] = [
  { tone: 'blue', title: '사용량 · 활동', description: '세션, 활성 사용자, 토큰' },
  { tone: 'purple', title: '비용', description: '공시 단가 · 계약 단가' },
  { tone: 'green', title: '산출', description: 'LoC 추가, 커밋, PR, 성공' },
  { tone: 'orange', title: '마찰 · 대기', description: '권한 대기, 자동 승인, 거절' },
  { tone: 'red', title: '이상 · 실패', description: '에러율, 거부, 정책 위반' },
  { tone: 'gray', title: '미관측', description: 'n<5 마스킹, 준비 중' },
];
function initialTheme(): 'light' | 'dark' {
  try { return localStorage.getItem('pulsemetry.theme') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}

export function App() {
  const [theme, setTheme] = useState(initialTheme);
  const [retryState, setRetryState] = useState<WidgetStatus>('error');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('pulsemetry.theme', theme); } catch { /* Theme still works without storage. */ }
  }, [theme]);

  return <Tooltip.Provider delayDuration={200}>
    <div className={s.desktop}>
      <header className={s.topbar}><a className={s.brand} href="#top">Pulsemetry</a><span className={s.divider} /><span>디자인 시스템</span><Badge>컴포넌트 미리보기</Badge><div className={s.theme} role="group" aria-label="테마"><Button aria-pressed={theme === 'light'} variant={theme === 'light' ? 'primary' : 'ghost'} onClick={() => setTheme('light')}>라이트</Button><Button aria-pressed={theme === 'dark'} variant={theme === 'dark' ? 'primary' : 'ghost'} onClick={() => setTheme('dark')}>다크</Button></div></header>
      <main className={s.main} id="top">
        <div className={s.intro}><div><p className={s.eyebrow}>PULSEMETRY / FOUNDATIONS</p><h1>하나의 규칙으로, 일관된 분석 경험</h1><p className={s.description}>콘솔 전반에 사용하는 색상, 타이포그래피, 컨트롤과 데이터 상태를 확인합니다.</p></div><a href="https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=1-2" target="_blank" rel="noreferrer">Figma 원본 보기 ↗</a></div>
        <Tabs.Root defaultValue="components">
          <Tabs.List className={s.tabs} aria-label="디자인 시스템 섹션"><Tabs.Trigger value="components" className={s.tab}>공통 컴포넌트</Tabs.Trigger><Tabs.Trigger value="tokens" className={s.tab}>디자인 토큰 <span>46</span></Tabs.Trigger></Tabs.List>
          <Tabs.Content value="components">
            <section className={s.section}><SectionTitle title="색상 의미" note="지표의 의미에 맞는 색상을 일관되게 사용합니다" /><div className={s.semanticGrid}>{semantics.map(({ tone, title, description }) => <div className={s.semantic} key={tone}><div className={s.colorBar} style={{ background: `var(--accent-${tone})` }} /><strong>{title}</strong><p>{description}</p></div>)}</div></section>
            <section className={s.section}><SectionTitle title="타이포그래피" note="Pretendard · 본문 13px / 1.45 · 숫자 tabular-nums" /><div className={s.typeGrid}><div><span className={s.typeKpi}>4,812.37</span><p>KPI · 30px</p></div><div><h1>팀 분석</h1><p>페이지 제목 · 18px</p></div><div><h2>비용과 사용 패턴</h2><p>섹션 제목 · 16px</p></div><div><span>데이터로 이해하는 AI 활용</span><p>본문 · 13px</p></div><div><code>claude_code</code><p>식별자 · 11.5px</p></div></div></section>
            <section className={s.section}><SectionTitle title="컨트롤과 배지" note="포커스 링 2px · 컨트롤 라운드 6px" /><div className={s.controls}><div className={s.controlGroup}><span className={s.groupLabel}>버튼</span><Button variant="primary" onClick={() => document.getElementById('widget-states')?.scrollIntoView({ behavior: 'smooth' })}>상태 확인</Button><Button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>테마 전환</Button><Button variant="ghost" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>맨 위로</Button><Button disabled>준비 중</Button></div><div className={s.controlGroup}><span className={s.groupLabel}>상태</span><Badge tone="blue">준비 완료</Badge><Badge tone="orange">일부 지원</Badge><Badge tone="red">이상 탐지</Badge><Badge>n&lt;5</Badge><Badge>준비 중</Badge><Badge tone="blue" solid>12</Badge></div></div></section>
            <section className={s.section}><SectionTitle title="KPI 카드" note="원본 KPICard · 단일 값 / 이중 값 / 비교 없음" /><div className={s.kpiGrid} data-testid="kpi-gallery">{(['green', 'red', 'gray', undefined] as const).map((tone, index) => <KpiCard key={index} label="활성 사용자" value="117" unit="명" definition="기간 내 활성 사용자를 집계합니다. 비교 기간이 없으면 증감은 표시하지 않습니다." delta={tone ? { tone, text: index === 0 ? '▲ +8.3%' : index === 1 ? '▼ −4.1%' : '▲ +12.4%', comparison: '전주 대비' } : undefined} />)}{(['green', 'red', 'gray', undefined] as const).map((tone, index) => <KpiCard key={`dual-${index}`} label="활성 사용자" value="117" unit="명" definition="이중 값 표시를 확인하기 위한 원본 컴포넌트 예시입니다." secondary={{ value: '−19,884', label: '삭제' }} delta={tone ? { tone, text: index === 0 ? '▲ +8.3%' : index === 1 ? '▼ −4.1%' : '▲ +12.4%', comparison: '전주 대비' } : undefined} />)}</div></section>
            <section className={s.section} id="widget-states"><SectionTitle title="위젯 상태" note="미관측과 0을 구분하고, 마스킹된 값은 노출하지 않습니다" /><div className={s.widgetGrid}>{(['loading', 'empty', 'error', 'masked'] as const).map((status, index) => <WidgetCard key={status} title={['로딩', '빈 상태', '오류와 재시도', '최소 집계 단위'][index]} definition="동일한 위젯 셸 안에서 데이터 상태를 표현합니다." caption="청구액 아님(공시 단가 추정)"><WidgetState status={status === 'error' ? retryState : status} onRetry={status === 'error' ? () => setRetryState('empty') : undefined} /></WidgetCard>)}</div></section>
          </Tabs.Content>
          <Tabs.Content value="tokens"><section className={s.section}><SectionTitle title="색상 토큰" note="Figma Pulsemetry 컬렉션에서 추출한 Light / Dark 변수" /><div className={s.tokenGrid}>{variables.variables.filter(v => v.type === 'COLOR').map(v => <div className={s.token} key={v.name}><div className={s.swatch} style={{ '--swatch': `var(--${v.name.replaceAll('/', '-')})` } as CSSProperties} /><code>{v.name}</code></div>)}</div></section></Tabs.Content>
        </Tabs.Root>
        <footer className={s.footer}><span>Pulsemetry Admin Console</span><span>공통 기반 · 0단계</span></footer>
      </main>
    </div>
  </Tooltip.Provider>;
}
function SectionTitle({ title, note }: { title: string; note: string }) {
  return <div className={s.sectionTitle}><h2>{title}</h2><p>{note}</p></div>;
}
