import { q } from '../../widgets/Widget';
export const kpiSpecs = [
  { metric: 'active_users', label: '활성 사용자', unit: '명', caption: 'user 활성시간>0' },
  { metric: 'adoption_rate', label: '도입률', unit: '%', caption: '활성 사용자 ÷ 활성 구성원' },
  { metric: 'cost', label: '비용', unit: 'USD', caption: '청구액 아님 · 단가 추정' },
  {
    metric: 'cost_per_active_user',
    label: '활성 사용자당 비용',
    unit: 'USD/명',
    caption: '비용 ÷ 활성 사용자',
  },
  { metric: 'sessions', label: '세션', unit: '', caption: '모든 시작 유형 포함' },
  { metric: 'lines_of_code', label: 'AI 관여 LoC', unit: '', caption: '도구가 편집한 파일의 diff' },
] as const;
export const overviewQueries = {
  cost: [
    q('cost', 'timeseries', { interval: '1d', price_basis: 'list' }),
    q('cost', 'timeseries', { ref_id: 'B', interval: '1d', price_basis: 'contract' }),
    q('cost_anomaly', 'timeseries', { ref_id: 'C', interval: '1d', params: { window_days: 7 } }),
  ],
  teams: [q('cost', 'table', { group_by: ['team'], limit: 10 })],
  models: [
    q('tokens', 'table', { group_by: ['model'], params: { types: ['input', 'output'] } }),
    q('model_users', 'table', { ref_id: 'B', group_by: ['model'] }),
  ],
  output: [
    q('lines_of_code', 'timeseries', { group_by: ['type'], interval: '1w' }),
    q('commits', 'timeseries', { ref_id: 'B', interval: '1w' }),
    q('pull_requests', 'timeseries', { ref_id: 'C', interval: '1w' }),
    q('integration_depth', 'scalar', { ref_id: 'D' }),
  ],
  adoption: [q('adoption_rate', 'timeseries', { group_by: ['team'], interval: '1w' })],
  trust: [
    q('edit_acceptance_rate'),
    q('auto_approval_ratio', 'scalar', { ref_id: 'B' }),
    q('edit_acceptance_rate', 'timeseries', { ref_id: 'C', interval: '1d' }),
    q('auto_approval_ratio', 'timeseries', { ref_id: 'D', interval: '1d' }),
  ],
  health: [
    q('api_error_rate', 'timeseries', { interval: '1h' }),
    q('llm_ttft_ms', 'timeseries', { ref_id: 'B', interval: '1h' }),
  ],
  governance: [
    q('refusals'),
    q('hook_blocking', 'scalar', { ref_id: 'B' }),
    q('hook_executions', 'scalar', { ref_id: 'C' }),
  ],
};
