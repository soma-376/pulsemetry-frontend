import type { FilterOptions, LoginResponse, Profile, QueryRequest, QueryResponse } from './types';
export const mockMode = import.meta.env.VITE_API_MODE !== 'real';
const base = (import.meta.env.VITE_API_BASE_URL || '/v1').replace(/\/$/, '');
let token: string | undefined;
export function setToken(value?: string) {
  token = value;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public requestId?: string,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  options: RequestInit = {},
  auditReason?: string,
  responseType: 'json' | 'text' = 'json',
  onHeaders?: (headers: Headers) => void,
): Promise<T> {
  if (
    auditReason !== undefined &&
    (auditReason.trim().length < 10 || auditReason.trim().length > 500)
  )
    throw new ApiError(400, '조회 사유는 10–500자여야 합니다.');
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (auditReason) headers.set('X-Audit-Reason', encodeURIComponent(auditReason.trim()));
  if (mockMode)
    headers.set('X-Mock-Case', sessionStorage.getItem('pulsemetry.mockCase') || 'normal');
  const response = await fetch(`${base}${path}`, { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 401 && path !== '/auth/login') {
      setToken();
      window.dispatchEvent(new Event('pulsemetry:unauthorized'));
    }
    throw new ApiError(
      response.status,
      body.message || `요청 실패 (${response.status})`,
      body.request_id,
    );
  }
  onHeaders?.(response.headers);
  return (responseType === 'text' ? response.text() : response.json()) as Promise<T>;
}
export const api = {
  queryCsv: (body: QueryRequest, signal?: AbortSignal, auditReason?: string) =>
    request<string>(
      '/query',
      { method: 'POST', body: JSON.stringify(body), headers: { Accept: 'text/csv' }, signal },
      auditReason,
      'text',
    ),
  login: (email: string, password: string) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: (signal?: AbortSignal) => request<Profile>('/me', { signal }),
  filters: (from: string, to: string, signal?: AbortSignal) =>
    request<FilterOptions>(`/meta/filters?${new URLSearchParams({ from, to })}`, { signal }),
  query: (body: QueryRequest, signal?: AbortSignal, auditReason?: string) =>
    request<QueryResponse>(
      '/query',
      { method: 'POST', body: JSON.stringify(body), signal },
      auditReason,
    ),
};
