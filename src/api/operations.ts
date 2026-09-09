import { request } from './client';
import type { components, paths } from './schema';
type Response<P extends keyof paths> = paths[P] extends {
  get: { responses: { 200: { content: { 'application/json': infer T } } } };
}
  ? T
  : never;
export type Contracts = Response<'/meta/contracts'>;
export type Manifests = Response<'/meta/manifests'>;
export type Members = Response<'/meta/members'>;
export type Installations = Response<'/installations'>;
export type Teams = Response<'/meta/teams'>;
export type SessionEvents = Response<'/sessions/{session_id}/events'>;
export type SessionEvent = components['schemas']['SessionEvent'];
export type Lookup = 'session_id' | 'request_id' | 'call_id' | 'installation_id';
export const opsApi = {
  contracts: (signal?: AbortSignal) => request<Contracts>('/meta/contracts', { signal }),
  manifests: (signal?: AbortSignal) => request<Manifests>('/meta/manifests', { signal }),
  teams: (signal?: AbortSignal) => request<Teams>('/meta/teams?include_archived=true', { signal }),
  members: (params: URLSearchParams, reason: string, signal?: AbortSignal) =>
    request<Members>(`/meta/members?${params}`, { signal }, reason),
  installations: (params: URLSearchParams, signal?: AbortSignal) =>
    request<Installations>(`/installations?${params}`, { signal }),
  events: (id: string, params: URLSearchParams, reason: string, signal?: AbortSignal) =>
    request<SessionEvents>(
      `/sessions/${encodeURIComponent(id)}/events?${params}`,
      { signal },
      reason,
    ),
};
// Deliberately select known metadata. Never render arbitrary payloads or prompt content.
export function eventDetails(event: SessionEvent) {
  const p = event.payload || {};
  const attrs =
    typeof p.attrs === 'object' && p.attrs !== null ? (p.attrs as Record<string, unknown>) : {};
  const safe = (key: string) => {
    const value = p[key] ?? attrs[key];
    return typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : typeof value === 'string'
        ? value.slice(0, 120)
        : undefined;
  };
  const details = [
    'model',
    'tool_name',
    'decision',
    'decided_by',
    'status_code',
    'attempt',
    'is_error',
    'prompt_length',
  ].flatMap((k) => (safe(k) === undefined ? [] : [`${k}: ${safe(k)}`]));
  if (event.signal === 'log' && event.type === 'llm_call') {
    const tokens =
      typeof p.tokens === 'object' && p.tokens !== null
        ? (p.tokens as Record<string, unknown>)
        : {};
    for (const key of ['input', 'output'])
      if (typeof tokens[key] === 'number') details.push(`${key}: ${tokens[key]} tok`);
    if (typeof p.cost_usd === 'number') details.push(`$${p.cost_usd.toFixed(4)}`);
  }
  return details.join(' · ');
}
export function durationMs(event: SessionEvent) {
  const p = event.payload || {};
  const attrs =
    typeof p.attrs === 'object' && p.attrs !== null ? (p.attrs as Record<string, unknown>) : {};
  const duration = p.duration_ms ?? attrs.duration_ms;
  return typeof duration === 'number' && Number.isFinite(duration) && duration >= 0
    ? duration
    : null;
}
export function maskedEmail(value?: string | null) {
  const domain = value?.split('@').pop();
  return value?.includes('@') && domain ? `***@${domain}` : '—';
}
