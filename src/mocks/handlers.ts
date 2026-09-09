import { resultCsv } from '../api/csv';
import { teamMetric } from './teamMetrics';
import { http, HttpResponse, delay } from 'msw';
import type {
  FilterOptions,
  Profile,
  QueryRequest,
  QueryResponse,
  QueryResult,
} from '../api/types';
export const paymentTeam = '11111111-1111-4111-8111-111111111111';
export const platformTeam = '22222222-2222-4222-8222-222222222222';
export const smallTeam = '33333333-3333-4333-8333-333333333333';
const teams = [
  { team_id: paymentTeam, name: '결제', status: 'active' as const, member_count: 12 },
  { team_id: platformTeam, name: '플랫폼', status: 'active' as const, member_count: 24 },
  { team_id: smallTeam, name: '정산', status: 'active' as const, member_count: 3 },
];
const tokens = new Map<string, { role: 'owner' | 'admin'; expires: number }>();
const error = (status: number, message: string) =>
  HttpResponse.json(
    {
      error: status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : 'internal_error',
      message,
      request_id: 'mock-request',
    },
    { status },
  );
function role(request: Request) {
  const token = tokens.get((request.headers.get('Authorization') || '').replace('Bearer ', ''));
  return token && token.expires > Date.now() ? token.role : undefined;
}
function resolved(expr: string) {
  const now = Date.parse('2026-09-07T09:44:12Z');
  const match = /^now(?:-(\d+)([hdw]))?(?:\/([dw]))?$/.exec(expr);
  if (match) {
    let ms =
      now -
      Number(match[1] || 0) * ({ h: 3600000, d: 86400000, w: 604800000 }[match[2] || 'd'] || 0);
    if (match[3]) {
      const date = new Date(ms + 32400000);
      date.setUTCHours(0, 0, 0, 0);
      if (match[3] === 'w') date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      ms = date.getTime() - 32400000;
    }
    return new Date(ms).toISOString();
  }
  return new Date(
    Number.isFinite(Date.parse(expr)) ? Date.parse(expr) : now - 604800000,
  ).toISOString();
}
export const handlers = [
  http.post('*/v1/auth/login', async ({ request }) => {
    await delay(150);
    const body = (await request.json()) as { email: string; password: string };
    const r =
      body.email === 'owner@pulsemetry.test'
        ? 'owner'
        : body.email === 'admin@pulsemetry.test'
          ? 'admin'
          : null;
    if (!r || body.password !== 'demo-pulse')
      return error(401, '이메일 또는 비밀번호가 올바르지 않거나 관리자 계정이 아닙니다.');
    const token = crypto.randomUUID();
    tokens.set(token, { role: r, expires: Date.now() + 3600000 });
    return HttpResponse.json({ access_token: token, token_type: 'Bearer', expires_in: 3600 });
  }),
  http.get('*/v1/me', ({ request }) => {
    const r = role(request);
    if (!r) return error(401, '로그인이 필요합니다.');
    return HttpResponse.json({
      member_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      email: `${r}@pulsemetry.test`,
      display_name: '데모 관리자',
      role: r,
      tenant: {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        name: '코드웍스',
        timezone: 'Asia/Seoul',
      },
      accessible_team_ids: r === 'owner' ? teams.map((t) => t.team_id) : [paymentTeam],
    } satisfies Profile);
  }),
  http.get('*/v1/meta/filters', async ({ request }) => {
    const r = role(request);
    if (!r) return error(401, '로그인이 필요합니다.');
    await delay(100);
    if (request.headers.get('X-Mock-Case') === 'meta-error')
      return error(503, '필터 옵션을 불러오지 못했습니다.');
    return HttpResponse.json({
      teams: r === 'owner' ? teams : teams.slice(0, 1),
      products: ['claude_code', 'codex'],
      models: [
        { model: 'claude-sonnet-4', product: 'claude_code', vendor: 'anthropic' },
        { model: 'gpt-5', product: 'codex', vendor: 'openai' },
      ],
      time_presets: ['now-24h', 'now-7d', 'now-28d', 'now-90d'],
      price_bases: ['list', 'contract'],
    } satisfies FilterOptions);
  }),
  http.post('*/v1/query', async ({ request }) => {
    const r = role(request);
    if (!r) return error(401, '로그인이 필요합니다.');
    const body = (await request.json()) as QueryRequest;
    const filters = [body.filters, ...(body.queries || []).map((q) => q.filters)];
    if (r === 'admin' && filters.some((f) => f?.team_ids?.some((t) => t !== paymentTeam)))
      return error(403, '접근할 수 없는 팀입니다.');
    if (
      filters.some((f) => f?.member_ids?.length) &&
      (request.headers.get('X-Audit-Reason')?.trim().length || 0) < 10
    )
      return error(403, '개인 조회 사유가 필요합니다.');
    const state = request.headers.get('X-Mock-Case');
    await delay(state === 'loading' ? 2500 : 160);
    if (state === 'error') return error(503, '목업 서버를 일시적으로 사용할 수 없습니다.');
    const empty = state === 'empty',
      masked = state === 'masked' || !!body.filters?.team_ids?.includes(smallTeam);
    const scoped = r === 'admin' || body.filters?.team_ids?.includes(paymentTeam);
    const platform = body.filters?.team_ids?.includes(platformTeam);
    const members = empty ? 0 : scoped ? 12 : platform ? 24 : 39;
    const installations = empty ? 0 : scoped ? 11 : platform ? 21 : 35;
    const results: Record<string, QueryResult> = {};
    for (const [i, q] of body.queries.entries())
      results[q.ref_id] =
        state === 'partial' && i === 1
          ? {
              status: 504,
              frames: [],
              error: {
                error: 'query_timeout',
                message: '일부 쿼리 시간 초과',
                request_id: 'mock-partial',
              },
            }
          : q.metric_id !== 'telemetry_coverage'
            ? teamMetric(
                q,
                {
                  ...body,
                  filters: {
                    ...body.filters,
                    ...q.filters,
                    ...(r === 'admin' ? { team_ids: [paymentTeam] } : {}),
                  },
                },
                resolved(body.from),
                resolved(body.to),
                state,
              ) || {
                status: 400,
                frames: [],
                error: {
                  error: 'invalid_request',
                  message: '이 지표의 목업은 아직 구현되지 않았습니다.',
                  request_id: 'mock-unsupported',
                },
              }
            : state === 'partial' && i === 1
              ? {
                  status: 504,
                  frames: [],
                  error: {
                    error: 'query_timeout',
                    message: '일부 쿼리 시간 초과',
                    request_id: 'mock-partial',
                  },
                }
              : {
                  status: 200,
                  frames: empty
                    ? []
                    : [
                        {
                          schema: {
                            ref_id: q.ref_id,
                            metric_id: q.metric_id,
                            frame_type: q.frame_type || 'scalar',
                            fields: [
                              {
                                name: 'value',
                                type: 'number',
                                labels: { team_name: scoped ? '결제' : '전체' },
                                config: {
                                  unit: 'ratio',
                                  suppressed: masked,
                                  group_size: masked ? 3 : members,
                                },
                              },
                            ],
                          },
                          data: { values: [[masked ? null : installations / members]] },
                        },
                      ],
                };
    if (request.headers.get('Accept') === 'text/csv') {
      const first = results[body.queries[0]?.ref_id];
      if (!first || first.status !== 200) return error(first?.status || 400, 'CSV 조회 실패');
      return new HttpResponse(resultCsv(first), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8' },
      });
    }
    return HttpResponse.json({
      request_id: 'mock-query',
      resolved_from: resolved(body.from),
      resolved_to: resolved(body.to),
      coverage: {
        active_installations: masked ? undefined : installations,
        active_members: masked ? undefined : members,
        ratio: masked ? null : members ? installations / members : null,
        last_ingested_at: '2026-09-07T09:41:12Z',
      },
      results,
    } satisfies QueryResponse);
  }),
];
