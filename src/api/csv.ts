import { adaptResult } from './frames';
import type { QueryResult } from './types';
export function csvCell(value: unknown) {
  const text = String(value ?? '미관측');
  // Quote delimiters and prevent spreadsheet formulas in string fields.
  const safe = typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function resultCsv(result: QueryResult) {
  const adapted = adaptResult(result);
  if (adapted.status === 'error') throw new Error('실패한 결과는 내보낼 수 없습니다.');
  const rows: unknown[][] = [
    ['metric', 'frame', 'row', 'field', 'labels', 'value', 'unit', 'state'],
  ];
  for (const [fi, f] of adapted.frames.entries())
    for (const [ri, row] of f.rows.entries())
      for (const [ci, c] of row.entries()) {
        const field = f.fields[ci];
        rows.push([
          result.frames[fi].schema.metric_id,
          fi,
          ri,
          field.name,
          JSON.stringify(field.labels || {}),
          c.state === 'value'
            ? c.value
            : c.state === 'masked'
              ? 'n<5'
              : c.state === 'zero-denominator'
                ? '분모 0'
                : '미관측',
          field.config?.unit || '',
          c.state,
        ]);
      }
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
