import { adaptResult, type Cell } from '../api/frames';
import type { QueryResult } from '../api/types';
export type Point = {
  key: string | number;
  value: Cell;
  previous?: Cell;
  labels: Record<string, string>;
  unit?: string;
};
export function series(result: QueryResult | undefined) {
  const adapted = adaptResult(result);
  const points: Point[] = [];
  for (const frame of adapted.frames) {
    const keyIndex = frame.fields.findIndex((f) => f.type === 'time' || f.type === 'string');
    frame.fields.forEach((field, i) => {
      if (field.type !== 'number' || field.name.endsWith('_compare')) return;
      const prev = frame.fields.findIndex((f) => f.name === field.name + '_compare');
      frame.rows.forEach((row) =>
        points.push({
          key:
            keyIndex >= 0
              ? (row[keyIndex].value as string | number)
              : field.config?.display_name || field.name,
          value: row[i],
          previous: prev >= 0 ? row[prev] : undefined,
          labels: field.labels || {},
          unit: field.config?.unit,
        }),
      );
    });
  }
  const numeric = points.filter((p) => p.value.state === 'value');
  return {
    ...adapted,
    points,
    state:
      adapted.status === 'error'
        ? ('error' as const)
        : points.some((p) => p.value.state === 'masked')
          ? ('masked' as const)
          : numeric.length
            ? ('success' as const)
            : ('empty' as const),
  };
}
export function number(cell?: Cell) {
  return cell?.state === 'value' && typeof cell.value === 'number' ? cell.value : null;
}
export function format(cell?: Cell, unit?: string) {
  if (cell?.state === 'masked') return '비공개';
  if (cell?.state === 'zero-denominator') return '분모 0';
  const n = number(cell);
  if (n === null) return '미관측';
  if (unit === 'ratio') return (n * 100).toLocaleString('en-US', { maximumFractionDigits: 1 });
  if (unit === 'USD')
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (unit === 's') return (n / 3600).toLocaleString('en-US', { maximumFractionDigits: 1 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
}
export function timeline(points: Point[], dimension = 'type') {
  const map = new Map<string | number, Record<string, number | string | null>>();
  for (const p of points) {
    const row = map.get(p.key) || { time: p.key };
    row[p.labels[dimension] || 'value'] = number(p.value);
    map.set(p.key, row);
  }
  return [...map.values()].sort((a, b) => Number(a.time) - Number(b.time));
}
