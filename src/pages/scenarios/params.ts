// The server remains the authoritative JSON Schema validator. Unsupported forms fail closed.
export type Schema = {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  format?: string;
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean | Schema;
  [key: string]: unknown;
};
export const labels: Record<string, string> = {
  from: '시작',
  to: '종료',
  team_ids: '팀',
  moving_avg_days: '이동평균 일수',
  spike_threshold_pct: '임계 (이동평균 대비 %)',
  budget_by_team: '예산표',
  premium_model_patterns: '상위 모델 패턴',
  io_ratio_threshold: '입력:출력 임계',
  as_of: '기준일',
  inactive_days: '무활동 일수',
  sprint_dates: '스프린트 일정',
  cohort_from: '코호트 시작',
  cohort_to: '코호트 종료',
  pivot_date: '전환 기준일',
  window_weeks: '비교 주 수',
  language: '언어',
  command_names: '명령 이름',
  wait_thresholds_min: '대기 임계 (분)',
  probe_window_min: '탐지 구간 (분)',
  probe_count: '탐지 건수',
  threshold_ms: '즉시 수락 임계 (ms)',
  models: '모델',
  failure_threshold: '실패율 임계',
  density_threshold: '접근 밀도 임계',
  growth_model: '성장 모델',
  model_a: '모델 A',
  model_b: '모델 B',
};
export function defaults(schema: Schema, source: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(schema.properties || {}).map(([key, p]) => [
      key,
      structuredClone(
        source[key] ?? p.default ?? (p.type === 'array' ? [] : p.type === 'object' ? {} : ''),
      ),
    ]),
  );
}
export function validate(schema: Schema, value: unknown, path = '입력'): string[] {
  if (['$ref', 'oneOf', 'anyOf', 'allOf', 'not', 'if', 'pattern'].some((k) => k in schema))
    return [`${path}: 지원하지 않는 입력 규칙입니다.`];
  if (schema.enum && !schema.enum.includes(value)) return [`${path}: 목록에서 값을 선택하세요.`];
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return [`${path}: 객체가 필요합니다.`];
    const obj = value as Record<string, unknown>,
      errors: string[] = [];
    for (const key of schema.required || [])
      if (obj[key] === undefined || obj[key] === '')
        errors.push(`${labels[key] || key}: 필수 항목입니다.`);
    for (const [key, v] of Object.entries(obj)) {
      const sub =
        schema.properties?.[key] ??
        (typeof schema.additionalProperties === 'object' ? schema.additionalProperties : undefined);
      if (sub) errors.push(...validate(sub, v, labels[key] || key));
      else if (schema.additionalProperties === false)
        errors.push(`${key}: 허용되지 않은 항목입니다.`);
    }
    return errors;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return [`${path}: 목록이 필요합니다.`];
    if (value.length < (schema.minItems || 0)) return [`${path}: 항목을 선택하세요.`];
    return schema.items
      ? value.flatMap((v) => validate(schema.items!, v, path))
      : [`${path}: 항목 규칙이 없습니다.`];
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      (schema.type === 'integer' && !Number.isInteger(value))
    )
      return [`${path}: 유효한 숫자를 입력하세요.`];
    if (value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))
      return [`${path}: ${schema.minimum ?? '−∞'}–${schema.maximum ?? '∞'} 범위로 입력하세요.`];
    return [];
  }
  if (schema.type === 'boolean')
    return typeof value === 'boolean' ? [] : [`${path}: 선택이 필요합니다.`];
  if (schema.type === 'string') {
    if (
      typeof value !== 'string' ||
      value.length < (schema.minLength || 0) ||
      value.length > (schema.maxLength ?? Infinity)
    )
      return [`${path}: 문자열 길이를 확인하세요.`];
    if (
      schema.format === 'date' &&
      (!/^\d{4}-\d\d-\d\d$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value)
    )
      return [`${path}: 올바른 날짜를 입력하세요.`];
    return [];
  }
  return [`${path}: 지원하지 않는 입력 형식입니다.`];
}
export function validateParams(schema: Schema, params: Record<string, unknown>) {
  const errors = validate(schema, params);
  const time = (v: unknown) =>
    typeof v === 'string' ? /^now(?:-\d+[hdw])?$/.test(v) || Number.isFinite(Date.parse(v)) : false;
  for (const k of ['from', 'to', 'as_of'])
    if (k in params && !time(params[k]))
      errors.push(`${labels[k]}: 날짜 또는 상대 기간을 확인하세요.`);
  const resolve = (v: unknown) => {
    const m = /^now(?:-(\d+)([hdw]))?$/.exec(String(v));
    return m
      ? Date.now() -
          Number(m[1] || 0) * ({ h: 3600000, d: 86400000, w: 604800000 }[m[2] || 'd'] || 0)
      : Date.parse(String(v));
  };
  for (const [a, b] of [
    ['from', 'to'],
    ['cohort_from', 'cohort_to'],
  ])
    if (params[a] && params[b] && resolve(params[a]) >= resolve(params[b]))
      errors.push('시작은 종료보다 이전이어야 합니다.');
  if (params.budget_by_team && typeof params.budget_by_team === 'object') {
    const budget = Object.entries(
      params.budget_by_team as Record<string, { usd?: number; tokens_m?: number }>,
    );
    if (!budget.length) errors.push('팀별 예산을 하나 이상 입력하세요.');
    for (const [, v] of budget)
      if ((v.usd !== undefined) === (v.tokens_m !== undefined))
        errors.push('팀별 USD 또는 토큰(M) 한쪽만 입력하세요.');
    const selected = params.team_ids as string[] | undefined;
    if (selected?.length && budget.some(([id]) => !selected.includes(id)))
      errors.push('선택한 팀의 예산만 입력하세요.');
  }
  return [...new Set(errors)];
}
