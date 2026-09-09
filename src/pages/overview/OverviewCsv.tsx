import { trapDialogTab } from '../../components/dialogFocus';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui';
import { api } from '../../api/client';
import { useScopedFilters } from '../../app/filterContext';
import { completedWeeks } from '../../widgets/time';
import type { QueryRequest } from '../../api/types';
import { q } from '../../widgets/Widget';
import { kpiSpecs, overviewQueries } from './queries';
import s from './Overview.module.css';
export function OverviewCsv() {
  const scope = useScopedFilters();
  return <CsvDialog key={scope.serialized} />;
}
function CsvDialog() {
  const { value, options, role } = useScopedFilters();
  const dialog = useRef<HTMLDialogElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [selected, setSelected] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => () => abort.current?.abort(), []);
  const choices: {
    label: string;
    query: QueryRequest['queries'][number];
    range?: 'weeks' | 'health';
  }[] = [
    ...kpiSpecs.map((k) => ({ label: k.label, query: q(k.metric) })),
    { label: '팀별 비용', query: overviewQueries.teams[0] },
    { label: '모델별 토큰', query: overviewQueries.models[0] },
    { label: '모델별 사용자', query: overviewQueries.models[1] },
    ...['공시 비용 추세', '계약 비용 추세', '비용 이상'].map((label, i) => ({
      label,
      query: overviewQueries.cost[i],
    })),
    ...['LoC 추세 · 최근 8주', '커밋 · 최근 8주', 'PR · 최근 8주', '통합 깊이 · 최근 8주'].map(
      (label, i) => ({ label, query: overviewQueries.output[i], range: 'weeks' as const }),
    ),
    { label: '팀 × 주 도입률 · 최근 8주', query: overviewQueries.adoption[0], range: 'weeks' },
    ...['편집 수락률', '자동 승인 비율', '편집 수락 추세', '자동 승인 추세'].map((label, i) => ({
      label,
      query: overviewQueries.trust[i],
    })),
    ...['API 에러율 · 최근 24h', 'TTFT · 최근 24h'].map((label, i) => ({
      label,
      query: overviewQueries.health[i],
      range: 'health' as const,
    })),
    ...(role === 'owner' && !value.filters?.team_ids?.length
      ? [{ label: '안전 거부 · 전사 합', query: overviewQueries.governance[0] }]
      : []),
    { label: '훅 차단', query: overviewQueries.governance[1] },
    { label: '훅 실행 세션', query: overviewQueries.governance[2] },
  ];
  async function download() {
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError('');
    try {
      const csv = await api.queryCsv(
        {
          ...value,
          ...(choices[selected].range === 'weeks'
            ? completedWeeks(value.to)
            : choices[selected].range === 'health'
              ? { from: 'now-24h', to: 'now', compare: 'none' as const }
              : {}),
          queries: [choices[selected].query],
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `pulsemetry-${choices[selected].query.metric_id}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      dialog.current?.close();
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '내보내기 실패');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <>
      <Button onClick={() => dialog.current?.showModal()} disabled={!options.data}>
        CSV
      </Button>
      <dialog
        ref={dialog}
        onKeyDown={trapDialogTab}
        className={s.dialog}
        aria-labelledby="overview-csv-title"
        onCancel={() => {
          abort.current?.abort();
          setBusy(false);
        }}
      >
        <h2 id="overview-csv-title">개요 데이터 내보내기</h2>
        <p>현재 필터의 지표 하나를 CSV로 저장합니다. 비공개 값은 내보내지 않습니다.</p>
        <label>
          지표{' '}
          <select
            value={selected}
            disabled={busy}
            onChange={(e) => setSelected(Number(e.target.value))}
          >
            {choices.map((c, i) => (
              <option key={i} value={i}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        {error && <p role="alert">{error}</p>}
        <footer>
          <Button
            onClick={() => {
              abort.current?.abort();
              setBusy(false);
              dialog.current?.close();
            }}
          >
            닫기
          </Button>
          <Button variant="primary" disabled={busy} onClick={download}>
            {busy ? '내보내는 중…' : '다운로드'}
          </Button>
        </footer>
      </dialog>
    </>
  );
}
