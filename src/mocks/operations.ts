import { http, HttpResponse, delay } from 'msw';
import type {
  Contracts,
  Manifests,
  Members,
  Installations,
  SessionEvents,
} from '../api/operations';
import type { Field, QueryRequest, QueryResult } from '../api/types';
const payment = '11111111-1111-4111-8111-111111111111';
const platform = '22222222-2222-4222-8222-222222222222';
export const contracts = {
  items: [
    {
      contract_id: 'c-anthropic',
      vendor: 'anthropic',
      name: 'Anthropic Enterprise 2026',
      contract_type: 'term_commitment',
      starts_at: '2026-01-01',
      ends_at: '2026-12-31',
      status: 'active',
      member_count: 24,
      term_commitment: {
        commitment_months: 12,
        commitment_amount: 120000,
        currency: 'USD',
        auto_renew: false,
      },
      token_discounts: [
        {
          model_pattern: 'claude-opus',
          token_type: 'all',
          discount_rate: 0.82,
          effective_from: '2026-01-01',
          effective_to: '2026-12-31',
        },
        {
          model_pattern: 'claude-sonnet',
          token_type: 'all',
          discount_rate: 0.8,
          effective_from: '2026-01-01',
          effective_to: '2026-12-31',
        },
        {
          model_pattern: 'claude-',
          token_type: 'cache_read',
          discount_rate: 0.75,
          effective_from: '2026-01-01',
          effective_to: '2026-12-31',
        },
      ],
    },
    {
      contract_id: 'c-openai',
      vendor: 'openai',
      name: 'OpenAI 2026',
      contract_type: 'token_discount',
      starts_at: '2026-03-01',
      ends_at: '2027-02-28',
      status: 'active',
      member_count: 12,
      term_commitment: null,
      token_discounts: [
        {
          model_pattern: 'gpt-5',
          token_type: 'all',
          discount_rate: 0.88,
          effective_from: '2026-03-01',
          effective_to: '2027-02-28',
        },
      ],
    },
    {
      contract_id: 'c-expired',
      vendor: 'anthropic',
      name: 'Anthropic Enterprise 2025',
      contract_type: 'term_commitment',
      starts_at: '2025-01-01',
      ends_at: '2025-12-31',
      status: 'expired',
      member_count: 0,
      term_commitment: {
        commitment_months: 12,
        commitment_amount: 80000,
        currency: 'USD',
        auto_renew: false,
      },
      token_discounts: [],
    },
  ],
} satisfies Contracts;
export const manifests = {
  active: {
    manifest_id: 'manifest-14',
    version: 14,
    activated_at: '2026-08-27T05:10:00Z',
    signals: { metrics: true, logs: true, traces: false },
    applied_installations: 33,
    assigned_installations: 35,
  },
  history: [
    { version: 14, created_at: '2026-08-27T05:10:00Z', is_active: true },
    { version: 13, created_at: '2026-08-01T00:00:00Z', is_active: false },
  ],
} satisfies Manifests;
const members: NonNullable<Members['items']> = Array.from({ length: 12 }, (_, i) => ({
  member_id: `member-${i}`,
  email: i === 0 ? 'owner@pulsemetry.test' : `dev-${String(i).padStart(4, '0')}@pulsemetry.test`,
  display_name: null,
  role: i === 0 ? 'owner' : i === 1 ? 'admin' : 'member',
  status: i === 10 ? 'invited' : i === 11 ? 'suspended' : 'active',
  team_ids: [i % 2 ? payment : platform],
  installation_count: i > 9 ? 0 : i === 0 ? 2 : 1,
  last_seen_at: i > 9 ? null : '2026-09-07T09:41:12Z',
}));
const installs: NonNullable<Installations['items']> = Array.from({ length: 12 }, (_, i) => ({
  installation_id: `inst_${i}`,
  member_email_masked: '***@pulsemetry.test',
  team_ids: [i % 2 ? payment : platform],
  hostname: null,
  platform: ['macos', 'linux', 'windows'][i % 3],
  client_version: i > 7 ? '1.9.8' : '2.1.14',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  last_seen_at: new Date(
    Date.parse('2026-09-07T09:41:12Z') - [0, 0, 1, 2, 34, 61, 92, 6, 2, 40, 64, 94][i] * 86400000,
  ).toISOString(),
  last_event_at: new Date(
    Date.parse('2026-09-07T09:41:12Z') - [0, 0, 1, 2, 34, 61, 92, 6, 2, 40, 64, 94][i] * 86400000,
  ).toISOString(),
}));
export const sessionFixture: SessionEvents = {
  session: {
    session_id: 'sess_demo',
    product: 'claude_code',
    client_version: '2.1.14',
    installation_id: 'inst_1',
    team_ids: [payment],
    started_at: '2026-09-03T05:02:11Z',
    ended_at: '2026-09-03T05:02:52.200Z',
    event_count: 14,
  },
  items: [
    'turn',
    'llm_request',
    'llm_call',
    'tool_gate',
    'tool_decision',
    'tool_execution',
    'tool_result',
    'llm_request',
    'api_error',
    'llm_request',
    'llm_call',
    'tool_gate',
    'tool_execution',
    'tool_result',
  ].map((type, i) => ({
    event_id: `ev-${i}`,
    ts: new Date(
      Date.parse('2026-09-03T05:02:11Z') +
        [0, 400, 7200, 7400, 17200, 17500, 21600, 21800, 25000, 25300, 33200, 33700, 35200, 35800][
          i
        ],
    ).toISOString(),
    signal: ['llm_call', 'tool_decision', 'tool_result', 'api_error'].includes(type)
      ? 'log'
      : 'span',
    type,
    turn_id: 'turn-14',
    span_id: ['llm_call', 'tool_decision', 'tool_result', 'api_error'].includes(type)
      ? null
      : `span-${i}`,
    parent_id: i === 0 ? null : 'span-0',
    sequence: i,
    payload: {
      duration_ms: [41200, 6800, 6800, 9800, 9800, 4100, 4100, 3200, 0, 7900, 7900, 1400, 600, 600][
        i
      ],
      ...(type.startsWith('llm_') ? { model: 'claude-sonnet-4' } : {}),
      ...(type.startsWith('tool_') ? { tool_name: i > 10 ? 'Edit' : 'Bash' } : {}),
      ...(type === 'llm_call'
        ? { tokens: { input: 12410 + i * 100, output: 1882 + i * 10 }, cost_usd: 0.0412 }
        : {}),
      ...(type === 'api_error' ? { status_code: 429, attempt: 1 } : {}),
      ...(type === 'tool_decision' ? { decision: 'accept', decided_by: 'user' } : {}),
      ...(type === 'tool_result' ? { is_error: false } : {}),
      ...(type === 'turn' ? { prompt_length: 212 } : {}),
    },
  })),
};
export const mockAuditRecords: { role: string; at: string; target: string; reason: string }[] = [];
function recordAudit(request: Request, role: string) {
  mockAuditRecords.push({
    role,
    at: new Date().toISOString(),
    target: new URL(request.url).pathname,
    reason: decodeURIComponent(request.headers.get('X-Audit-Reason') || ''),
  });
  if (mockAuditRecords.length > 100) mockAuditRecords.shift();
}
function resolveSessionTime(value: string | null) {
  const now = Date.parse('2026-09-07T09:44:12Z');
  const m = /^now(?:-(\d+)([hdw]))?$/.exec(value || '');
  return m
    ? now - Number(m[1] || 0) * ({ h: 3600000, d: 86400000, w: 604800000 }[m[2] || 'd'] || 0)
    : Date.parse(value || '');
}
export function operationsHandlers(
  role: (r: Request) => 'owner' | 'admin' | undefined,
  teams: { team_id: string; name: string; status: 'active'; member_count: number }[],
) {
  const failure = (status: number, message: string) =>
    HttpResponse.json(
      {
        error:
          status === 401
            ? 'unauthorized'
            : status === 404
              ? 'not_found'
              : status === 400
                ? 'invalid_request'
                : status >= 500
                  ? 'internal_error'
                  : 'forbidden',
        message,
        request_id: 'mock-ops',
      },
      { status },
    );
  const gated = async (request: Request, owner = false) => {
    const r = role(request);
    if (!r) return failure(401, '로그인이 필요합니다.');
    if (owner && r !== 'owner') return failure(403, 'owner 권한이 필요합니다.');
    await delay(request.headers.get('X-Mock-Case') === 'loading' ? 2500 : 120);
    if (request.headers.get('X-Mock-Case') === 'error') return failure(503, '조회에 실패했습니다.');
  };
  const page = <T>(items: T[], url: URL) => {
    const offset = Number(url.searchParams.get('cursor')?.replace('page:', '') || 0),
      limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') || 8)));
    return {
      items: items.slice(offset, offset + limit),
      total: items.length,
      next_cursor: offset + limit < items.length ? `page:${offset + limit}` : null,
    };
  };
  const audit = (request: Request) => {
    try {
      const r = decodeURIComponent(request.headers.get('X-Audit-Reason') || '').trim();
      return r.length >= 10 && r.length <= 500;
    } catch {
      return false;
    }
  };
  const empty = (r: Request) => r.headers.get('X-Mock-Case') === 'empty';
  return [
    http.get(
      '*/v1/meta/contracts',
      async ({ request }) =>
        (await gated(request)) || HttpResponse.json(empty(request) ? { items: [] } : contracts),
    ),
    http.get(
      '*/v1/meta/manifests',
      async ({ request }) =>
        (await gated(request)) ||
        HttpResponse.json(empty(request) ? { active: null, history: [] } : manifests),
    ),
    http.get(
      '*/v1/meta/teams',
      async ({ request }) =>
        (await gated(request)) ||
        HttpResponse.json({
          items: empty(request) ? [] : role(request) === 'owner' ? teams : teams.slice(0, 1),
        }),
    ),
    http.get('*/v1/meta/members', async ({ request }) => {
      const fail = await gated(request, true);
      if (fail) return fail;
      if (!audit(request)) return failure(403, '구성원 이메일 조회 사유가 필요합니다.');
      recordAudit(request, role(request)!);
      const url = new URL(request.url);
      return HttpResponse.json(
        page(
          empty(request)
            ? []
            : members.filter(
                (m) =>
                  (!url.searchParams.get('team_id') ||
                    m.team_ids?.includes(url.searchParams.get('team_id')!)) &&
                  (!url.searchParams.get('status') || m.status === url.searchParams.get('status')),
              ),
          url,
        ),
      );
    }),
    http.get('*/v1/installations', async ({ request }) => {
      const fail = await gated(request);
      if (fail) return fail;
      const url = new URL(request.url),
        team = url.searchParams.get('team_id');
      if (role(request) === 'admin' && team && team !== payment)
        return failure(403, '접근할 수 없는 팀입니다.');
      const days = Number(url.searchParams.get('inactive_days') || 0);
      return HttpResponse.json(
        page(
          empty(request)
            ? []
            : installs.filter(
                (i) =>
                  (!team || i.team_ids?.includes(team)) &&
                  (role(request) === 'owner' || i.team_ids?.includes(payment)) &&
                  (!days ||
                    Date.parse(i.last_event_at!) <=
                      Date.parse('2026-09-07T09:44:12Z') - days * 86400000),
              ),
          url,
        ),
      );
    }),
    http.get('*/v1/sessions/:id/events', async ({ request, params }) => {
      const fail = await gated(request, true);
      if (fail) return fail;
      if (!audit(request)) return failure(403, '조회 사유는 10–500자여야 합니다.');
      const url = new URL(request.url);
      const lookup = url.searchParams.get('lookup') || 'session_id';
      if (!['session_id', 'request_id', 'call_id', 'installation_id'].includes(lookup))
        return failure(400, '잘못된 검색 유형입니다.');
      recordAudit(request, role(request)!);
      if (
        !(
          {
            session_id: ['sess_demo', 'sess_01J7Q9K3M8XQ'],
            request_id: ['req_demo'],
            call_id: ['call_demo'],
            installation_id: ['inst_1'],
          }[lookup as 'session_id'] as string[]
        ).includes(String(params.id))
      )
        return failure(404, '세션을 찾을 수 없습니다.');
      const from = resolveSessionTime(url.searchParams.get('from')),
        to = resolveSessionTime(url.searchParams.get('to'));
      return HttpResponse.json({
        ...page(
          empty(request)
            ? []
            : sessionFixture.items!.filter(
                (e) =>
                  (!Number.isFinite(from) || Date.parse(e.ts!) >= from) &&
                  (!Number.isFinite(to) || Date.parse(e.ts!) < to),
              ),
          url,
        ),
        session: sessionFixture.session,
      });
    }),
  ];
}
type Q = QueryRequest['queries'][number];
export function operationsMetric(
  q: Q,
  body: QueryRequest,
  from: string,
  to: string,
  state: string | null,
): QueryResult | undefined {
  const group = q.group_by || [];
  const supported =
    (q.metric_id === 'tool_failure_rate' && group.includes('tool_name')) ||
    (q.metric_id === 'mcp_connections' && group.includes('is_plugin')) ||
    q.metric_id === 'llm_duration_ms' ||
    q.metric_id === 'api_retry_attempts' ||
    q.metric_id === 'rate_limit_events' ||
    q.metric_id === 'vendor_account_mismatch' ||
    q.metric_id === 'rubber_stamp_ratio' ||
    q.metric_id === 'contract_commitment_burn' ||
    (q.metric_id === 'api_error_rate' && group.includes('status_code')) ||
    (q.metric_id === 'refusals' && group.includes('category')) ||
    (q.metric_id === 'tool_rejections' && q.frame_type === 'timeseries') ||
    (q.metric_id === 'hook_executions' && q.frame_type === 'timeseries') ||
    (q.metric_id === 'hook_blocking' && q.frame_type === 'timeseries');
  if (!supported) return;
  if (q.metric_id === 'contract_commitment_burn' && body.filters?.team_ids?.length)
    return {
      status: 403,
      frames: [],
      error: {
        error: 'forbidden',
        request_id: 'mock-contract-scope',
        message: '전사 약정은 owner 범위에서 조회합니다.',
      },
    };
  if (q.metric_id === 'refusals' && body.filters?.team_ids?.length)
    return {
      status: 403,
      frames: [],
      error: {
        request_id: 'mock-ops-scope',
        error: 'forbidden',
        message: '안전 거부는 전사 조회만 가능합니다.',
      },
    };
  const masked =
    state === 'masked' || body.filters?.team_ids?.includes('33333333-3333-4333-8333-333333333333');
  const fields: Field[] = [],
    values: (string | number | boolean | null)[][] = [];
  const add = (
    name: string,
    type: Field['type'],
    v: (string | number | boolean | null)[],
    unit?: string,
    labels?: Record<string, string>,
  ) => {
    fields.push({
      name,
      type,
      labels,
      config: { unit, suppressed: masked, group_size: masked ? 3 : 39 },
    });
    values.push(masked ? v.map(() => null) : v);
  };
  const days = Math.max(1, (Date.parse(to) - Date.parse(from)) / 86400000),
    factor =
      (body.filters?.team_ids?.length?.valueOf() ? 0.33 : 1) *
      (body.filters?.products?.length === 1 ? 0.65 : 1) *
      (body.filters?.models?.length?.valueOf() ? 0.55 : 1);
  if (q.frame_type === 'timeseries') {
    const count =
      q.interval === '1h' ? Math.min(1000, Math.ceil(days * 24)) : Math.min(1000, Math.ceil(days));
    add(
      'time',
      'time',
      Array.from(
        { length: count },
        (_, i) => Date.parse(from) + (i * (Date.parse(to) - Date.parse(from))) / count,
      ),
    );
    const ids =
      q.metric_id === 'llm_duration_ms'
        ? ['p50', 'p95', 'p99']
        : q.metric_id === 'api_error_rate'
          ? ['500', '429', '400']
          : q.metric_id === 'rate_limit_events'
            ? body.filters?.models?.length
              ? body.filters.models
              : ['claude-sonnet-4', 'gpt-5']
            : q.metric_id === 'tool_rejections'
              ? ['config', 'hook']
              : q.metric_id === 'hook_executions'
                ? ['PreToolUse', 'PostToolUse', 'other']
                : ['value'];
    ids.forEach((id, j) => {
      const vals = Array.from({ length: count }, (_, i) => {
        const spike = i === Math.floor(count * 0.3) ? 3 : 1 + (i % 4) * 0.12;
        switch (q.metric_id) {
          case 'llm_duration_ms':
            return [1860, 4500, 6700][j] * spike;
          case 'api_error_rate':
            return [0.001, 0.002, 0.001][j] * spike;
          case 'api_retry_attempts':
            return 0.013 * spike;
          case 'rate_limit_events':
            return i % 37 === j ? Math.round((j + 1) * 4 * factor) : 0;
          case 'tool_rejections':
            return Math.round([22, 8][j] * spike * factor);
          case 'hook_executions':
            return Math.round([640, 420, 90][j] * spike * factor);
          default:
            return Math.round(6 * spike * factor);
        }
      });
      if (q.metric_id === 'hook_blocking') {
        const selected = [
          { id: payment, n: 11 },
          { id: platform, n: 21 },
          { id: '33333333-3333-4333-8333-333333333333', n: 3 },
        ].filter((t) => !body.filters?.team_ids?.length || body.filters.team_ids.includes(t.id));
        const total = Math.round(
          (((42 * selected.reduce((n, t) => n + t.n, 0)) / 11) *
            (body.filters?.products?.length === 1 ? 0.65 : 1) *
            (body.filters?.models?.length ? 0.55 : 1) *
            days) /
            7,
        );
        const sum = vals.reduce((n, v) => n + v, 0);
        let cumulative = 0,
          previous = 0;
        vals.forEach((v, i) => {
          cumulative += sum ? v / sum : 1 / vals.length;
          const next = Math.round(cumulative * total);
          vals[i] = next - previous;
          previous = next;
        });
      }
      add(
        id,
        'number',
        vals,
        q.metric_id === 'llm_duration_ms'
          ? 'ms'
          : ['api_error_rate', 'api_retry_attempts'].includes(q.metric_id)
            ? 'ratio'
            : 'count',
        { type: id, model: id, status_code: id, decided_by: id, hook_event: id },
      );
    });
  } else if (q.metric_id === 'tool_failure_rate') {
    const calls = [1842, 1210, 3306, 214, 402, 388, 176, 1120].map((v) =>
        Math.round(((v * days) / 7) * factor),
      ),
      fail = [71, 38, 41, 19, 9, 24, 2, 6].map((v) => Math.round(((v * days) / 7) * factor));
    add('tool_name', 'string', [
      'Bash',
      'Edit',
      'Read',
      'WebFetch',
      'Write',
      'mcp__github',
      'mcp__jira',
      'Grep',
    ]);
    add('calls', 'number', calls, 'count');
    add('failures', 'number', fail, 'count');
    add(
      'failure_rate',
      'number',
      calls.map((v, i) => (v ? fail[i] / v : null)),
      'ratio',
    );
    add('top_error_type', 'string', [
      'timeout',
      'permission_denied',
      'file_not_found',
      'rate_limited',
      'permission_denied',
      'network',
      'timeout',
      'parse_error',
    ]);
  } else if (q.metric_id === 'mcp_connections') {
    add('server_name', 'string', [
      'github',
      'jira',
      'postgres',
      'figma',
      'sentry',
      'slack',
      'browser-tools',
      'notion-connector',
      'filesystem',
    ]);
    add('server_scope', 'string', [
      'org',
      'org',
      'org',
      'project',
      'org',
      'project',
      'user',
      'user',
      'project',
    ]);
    add('transport_type', 'string', [
      'http',
      'stdio',
      'stdio',
      'sse',
      'http',
      'http',
      'stdio',
      'http',
      'stdio',
    ]);
    add('is_plugin', 'boolean', [false, false, false, true, true, false, false, true, false]);
    add(
      'connections',
      'number',
      [12, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => Math.round((n * factor * days) / 7)),
      'count',
    );
    add(
      'sessions',
      'number',
      [1204, 640, 388, 92, 210, 61, 44, 17, 305].map((n) => Math.round((n * factor * days) / 7)),
      'count',
    );
  } else if (q.metric_id === 'refusals') {
    add('category', 'string', ['cyber', 'frontier_llm', 'reasoning_extraction', 'bio', '미분류']);
    add(
      'refusals',
      'number',
      [3, 2, 1, 0, 1].map((n) => Math.round(((n * days) / 7) * factor)),
      'count',
    );
  } else if (q.metric_id === 'vendor_account_mismatch') {
    add('installation_id', 'string', ['inst_1', 'inst_3', 'inst_5']);
    add('registered_email', 'string', Array(3).fill('***@pulsemetry.test'));
    add('vendor_email', 'string', ['***@gmail.com', '***@outlook.com', '***@proton.me']);
    add('last_seen_at', 'string', Array(3).fill('2026-09-07T09:41:12Z'));
  } else if (q.metric_id === 'rubber_stamp_ratio') {
    add('ratio', 'number', [0.124], 'ratio');
    add('instant_accepts', 'number', [124], 'count');
    add('accepts', 'number', [1000], 'count');
  } else if (q.metric_id === 'contract_commitment_burn') {
    add('burn_ratio', 'number', [0.582], 'ratio');
    add('cost_usd', 'number', [69840], 'USD');
    add('commitment_amount', 'number', [120000], 'USD');
  } else return;
  return {
    status: 200,
    frames:
      state === 'empty'
        ? []
        : [
            {
              schema: {
                ref_id: q.ref_id,
                metric_id: q.metric_id,
                frame_type: q.frame_type || 'scalar',
                fields,
                meta: { caveat: '합성 목업 · 필드 매핑은 실 API 확인 필요' },
              },
              data: { values },
            },
          ],
  };
}
