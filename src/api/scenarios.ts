import { request } from './client';
import type { components, operations } from './schema';
export type Scenario = components['schemas']['ScenarioSummary'];
export type Detail = components['schemas']['ScenarioDetail'];
export type Run = components['schemas']['ScenarioRun'];
export type Category = components['schemas']['ScenarioCategory'];
export type Catalog = operations['SCN-LIST']['responses'][200]['content']['application/json'];
export type RunInput = operations['SCN-RUN']['requestBody']['content']['application/json'];
export const activeRun = (run: Run) => run.status === 'queued' || run.status === 'running';
export function pollDelay(value: string | null) {
  const seconds = Number(value);
  return value && Number.isFinite(seconds) && seconds > 0 ? Math.max(1000, seconds * 1000) : 2000;
}
async function runRequest(path: string, options: RequestInit = {}) {
  let retryMs = 2000;
  const run = await request<Run>(path, options, undefined, 'json', (h) => {
    retryMs = pollDelay(h.get('Retry-After'));
  });
  if (
    !run.run_id ||
    !run.status ||
    !['queued', 'running', 'succeeded', 'failed', 'cancelled'].includes(run.status)
  )
    throw new Error('실행 응답에 ID 또는 상태가 없습니다.');
  return { run, retryMs };
}
export const scenarioApi = {
  catalog: (signal?: AbortSignal) => request<Catalog>('/scenarios', { signal }),
  detail: (id: string, signal?: AbortSignal) =>
    request<Detail>(`/scenarios/${encodeURIComponent(id)}`, { signal }),
  start: (id: string, input: RunInput, signal?: AbortSignal) =>
    runRequest(`/scenarios/${encodeURIComponent(id)}/runs`, {
      method: 'POST',
      body: JSON.stringify(input),
      signal,
    }),
  get: (id: string, signal?: AbortSignal) =>
    runRequest(`/scenario-runs/${encodeURIComponent(id)}`, { signal }),
  cancel: (id: string, signal?: AbortSignal) =>
    runRequest(`/scenario-runs/${encodeURIComponent(id)}/cancel`, { method: 'POST', signal }),
};
