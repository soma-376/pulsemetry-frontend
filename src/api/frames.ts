import type { Field, Frame, QueryResult } from './types';
export type Cell = {
  value: string | number | boolean | null;
  state: 'value' | 'missing' | 'masked' | 'zero-denominator';
};
export type AdaptedFrame = {
  type: Frame['schema']['frame_type'];
  fields: Field[];
  rows: Cell[][];
  meta: Frame['schema']['meta'];
};
export function adaptFrame(frame: Frame): AdaptedFrame {
  const { fields, meta } = frame.schema;
  const columns = frame.data.values;
  if (
    fields.length !== columns.length ||
    columns.some((c) => !Array.isArray(c) || c.length !== (columns[0]?.length ?? 0))
  )
    throw new Error('DataFrame 열 길이가 일치하지 않습니다.');
  const rows = Array.from({ length: columns[0]?.length ?? 0 }, (_, row) =>
    fields.map((field, col): Cell => {
      const config = field.config;
      if (
        config?.suppressed ||
        (config?.group_size !== undefined && config.group_size < 5) ||
        (field.type === 'number' && (meta?.suppressed_groups?.length ?? 0) > 0)
      )
        return { value: null, state: 'masked' };
      if (config?.denominator === 0) return { value: null, state: 'zero-denominator' };
      const value = columns[col][row];
      if (value === null || value === undefined) return { value: null, state: 'missing' };
      const expected = field.type === 'time' ? 'number' : field.type;
      if (typeof value !== expected || (typeof value === 'number' && !Number.isFinite(value)))
        throw new Error(`DataFrame 필드 타입 불일치: ${field.name}`);
      return { value: value as string | number | boolean, state: 'value' };
    }),
  );
  return { type: frame.schema.frame_type, fields, rows, meta };
}
export function adaptResult(result: QueryResult | undefined) {
  if (!result)
    return { status: 'error' as const, frames: [], message: '응답에 요청 결과가 없습니다.' };
  if (result.status !== 200)
    return {
      status: 'error' as const,
      frames: [],
      message: result.error?.message || '쿼리에 실패했습니다.',
    };
  try {
    const frames = result.frames.map(adaptFrame);
    return {
      status: frames.some((f) => f.rows.length) ? ('success' as const) : ('empty' as const),
      frames,
    };
  } catch (error) {
    return { status: 'error' as const, frames: [], message: (error as Error).message };
  }
}
