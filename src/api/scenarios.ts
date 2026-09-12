import { request } from './client';
import type { components, operations } from './schema';
export type Scenario = components['schemas']['ScenarioSummary'];
export type Detail = components['schemas']['ScenarioDetail'];
export type Run = components['schemas']['ScenarioRun'];
export type SavedReport = components['schemas']['SavedReport'];
export type RunSummary = components['schemas']['ScenarioRunSummary'];
export type SaveInput = operations['RUN-SAVE']['requestBody']['content']['application/json'];
export type RunList = operations['RUN-LIST']['responses'][200]['content']['application/json'];
export type SavedList = operations['SAVED-LIST']['responses'][200]['content']['application/json'];
export type Category = components['schemas']['ScenarioCategory'];
export type Catalog = operations['SCN-LIST']['responses'][200]['content']['application/json'];
export type RunInput = operations['SCN-RUN']['requestBody']['content']['application/json'];
export const activeRun = (run: Run) => run.status === 'queued' || run.status === 'running';
export function pollDelay(value: string | null) {
  const seconds = Number(value);
  return value && Number.isFinite(seconds) && seconds > 0 ? Math.max(1000, seconds * 1000) : 2000;
}
async function runRequest(path: string, options: RequestInit = {}, auditReason?: string) {
  let retryMs = 2000;
  const run = await request<Run>(path, options, auditReason, 'json', (h) => {
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
  list: (cursor?: string, signal?: AbortSignal) =>
    request<RunList>(
      `/scenario-runs?${new URLSearchParams({ limit: '10', ...(cursor ? { cursor } : {}) })}`,
      { signal },
    ),
  saved: (cursor?: string, signal?: AbortSignal) =>
    request<SavedList>(
      `/saved-reports?${new URLSearchParams({ limit: '10', ...(cursor ? { cursor } : {}) })}`,
      { signal },
    ),
  save: (id: string, input: SaveInput, signal?: AbortSignal) =>
    request<SavedReport>(`/scenario-runs/${encodeURIComponent(id)}/save`, {
      method: 'POST',
      body: JSON.stringify(input),
      signal,
    }),
  remove: (id: string, signal?: AbortSignal) =>
    request<string>(
      `/scenario-runs/${encodeURIComponent(id)}`,
      { method: 'DELETE', signal },
      undefined,
      'text',
    ),
  removeSaved: (id: string, signal?: AbortSignal) =>
    request<string>(
      `/saved-reports/${encodeURIComponent(id)}`,
      { method: 'DELETE', signal },
      undefined,
      'text',
    ),
  catalog: (signal?: AbortSignal) => request<Catalog>('/scenarios', { signal }),
  detail: (id: string, signal?: AbortSignal) =>
    request<Detail>(`/scenarios/${encodeURIComponent(id)}`, { signal }),
  start: (id: string, input: RunInput, signal?: AbortSignal, auditReason?: string) =>
    runRequest(`/scenarios/${encodeURIComponent(id)}/runs`, {
      method: 'POST',
      body: JSON.stringify(input),
      signal,
    }, auditReason),
  get: (id: string, signal?: AbortSignal) =>
    runRequest(`/scenario-runs/${encodeURIComponent(id)}`, { signal }),
  cancel: (id: string, signal?: AbortSignal) =>
    runRequest(`/scenario-runs/${encodeURIComponent(id)}/cancel`, { method: 'POST', signal }),
};
