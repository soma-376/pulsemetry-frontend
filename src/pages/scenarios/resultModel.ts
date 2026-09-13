import type { Run, RunInput } from '../../api/scenarios';
import type { Filters } from '../../app/filters';
import { readFilters, writeFilters } from '../../app/filters';
import { adaptResult } from '../../api/frames';
export const targetPaths: Record<string, string> = {
  P1: '/',
  P2: '/teams',
  P3: '/operations',
  P4: '/scenarios',
  P5: '/settings',
};
export const targetNames: Record<string, string> = {
  P1: '개요',
  P2: '팀 분석',
  P3: '운영 · 보안',
  P4: '시나리오',
  P5: '설정',
};
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
// The spec example flattens dimensions, while its description references QueryRequest.
// Accept both layouts, but never put personal dimensions in the global filter URL.
export function resultFilters(run: Run): Filters {
  const a = run.result?.applied_filters || {};
  const f = a.filters && typeof a.filters === 'object' ? (a.filters as Record<string, unknown>) : a;
  const value: Filters = {
    from: typeof a.from === 'string' ? a.from : run.resolved_from || 'now-7d',
    to: typeof a.to === 'string' ? a.to : run.resolved_to || 'now',
    tz: 'Asia/Seoul',
    compare: 'none',
    price_basis: a.price_basis === 'contract' ? 'contract' : 'list',
    filters: {
      team_ids: strings(f.team_ids),
      models: strings(f.models),
      products: strings(f.products).filter(
        (p): p is 'claude_code' | 'codex' => p === 'claude_code' || p === 'codex',
      ),
    },
  };
  return readFilters(writeFilters(value));
}
export function rerunInput(run: Run): RunInput {
  if (!run.params) throw new Error('재실행할 파라미터가 없습니다.');
  const a = run.result?.applied_filters;
  return {
    params: structuredClone(run.params),
    price_basis: a?.price_basis === 'contract' ? 'contract' : 'list',
    tz: typeof a?.tz === 'string' ? a.tz : 'Asia/Seoul',
  };
}
export function resultRestricted(run: Run, role?: string, teamIds: string[] = []) {
  if (role === 'owner') return false;
  if (role !== 'admin' || run.result?.target_page === 'P3' || run.result?.frames?.refusals)
    return true;
  const selected = resultFilters(run).filters?.team_ids || [];
  return !selected.length || selected.some((t) => !teamIds.includes(t));
}
export function hasMaskedFrames(run: Run) {
  return Object.values(run.result?.frames || {}).some((r) =>
    adaptResult(r).frames.some((f) => f.rows.some((row) => row.some((c) => c.state === 'masked'))),
  );
}
export const resultPath = (id: string) => `/runs/${encodeURIComponent(id)}`;
export function shareUrl(id: string, origin = window.location.origin) {
  return origin + resultPath(id);
}
