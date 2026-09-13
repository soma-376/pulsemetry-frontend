import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { adaptResult } from '../api/frames';
import { WidgetCard, WidgetState } from '../components/ui';
export function ApiPreview() {
  const cache = useQueryClient();
  const [state, setState] = useState(
    () => sessionStorage.getItem('pulsemetry.mockCase') || 'normal',
  );
  const query = useQuery({
    queryKey: ['widget', 'api-preview', state],
    queryFn: ({ signal }) =>
      api.query(
        {
          from: 'now-7d',
          to: 'now',
          queries: [
            { ref_id: 'A', metric_id: 'telemetry_coverage', frame_type: 'scalar' },
            { ref_id: 'B', metric_id: 'telemetry_coverage', frame_type: 'scalar' },
          ],
        },
        signal,
      ),
  });
  return (
    <>
      <h1>API 상태 검증 도구</h1>
      <p>개발용 목업 제어입니다. 이 탭의 커버리지 요청에도 적용됩니다.</p>
      <label>
        목업 상태{' '}
        <select
          aria-label="목업 상태"
          value={state}
          onChange={(e) => {
            sessionStorage.setItem('pulsemetry.mockCase', e.target.value);
            setState(e.target.value);
            cache.invalidateQueries();
          }}
        >
          {['normal', 'empty', 'masked', 'partial', 'error', 'meta-error', 'loading'].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, margin: '24px 0' }}>
        {['A', 'B'].map((ref) => {
          const result = adaptResult(query.data?.results[ref]);
          const cell = result.frames[0]?.rows[0]?.[0];
          return (
            <WidgetCard key={ref} title={`응답 ${ref}`}>
              <div data-testid={`result-${ref}`}>
                {query.isPending ? (
                  <WidgetState status="loading" />
                ) : query.isError || result.status === 'error' ? (
                  <WidgetState status="error" onRetry={() => query.refetch()} />
                ) : result.status === 'empty' ? (
                  <WidgetState status="empty" />
                ) : cell?.state === 'masked' ? (
                  <WidgetState status="masked" />
                ) : (
                  <p>{cell?.state === 'value' ? cell.value : '미관측'}</p>
                )}
              </div>
            </WidgetCard>
          );
        })}
      </div>
      <Link to="/">콘솔로 돌아가기</Link>
    </>
  );
}
