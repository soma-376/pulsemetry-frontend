import { describe, expect, it } from 'vitest';
import { adaptFrame, adaptResult } from './frames';
import type { Field, Frame } from './types';
const frame = (config?: Field['config'], values: unknown[][] = [[0, null]]): Frame => ({
  schema: {
    ref_id: 'A',
    metric_id: 'active_users',
    frame_type: 'scalar',
    fields: [{ name: 'value', type: 'number', labels: { team: '결제' }, config }],
  },
  data: { values },
});
describe('DataFrame adapter', () => {
  it('preserves zero, missing values and field labels', () => {
    const result = adaptFrame(frame());
    expect(result.rows).toEqual([
      [{ value: 0, state: 'value' }],
      [{ value: null, state: 'missing' }],
    ]);
    expect(result.fields[0].labels).toEqual({ team: '결제' });
  });
  it.each([{ suppressed: true }, { group_size: 3 }])('discards values when masked (%j)', (config) =>
    expect(adaptFrame(frame(config, [[123]])).rows[0][0]).toEqual({ value: null, state: 'masked' }),
  );
  it('keeps denominator zero distinct', () =>
    expect(adaptFrame(frame({ denominator: 0 }, [[123]])).rows[0][0]).toEqual({
      value: null,
      state: 'zero-denominator',
    }));
  it('honors frame masking metadata', () => {
    const f = frame(undefined, [[123]]);
    f.schema.meta = { suppressed_groups: ['결제'] };
    expect(adaptFrame(f).rows[0][0].value).toBeNull();
  });
  it.each(['timeseries', 'table', 'distribution', 'scalar'] as const)(
    'adapts %s column-oriented rows',
    (type) => {
      const f = frame();
      f.schema.frame_type = type;
      f.schema.fields.unshift({ name: 'time', type: 'time' });
      f.data.values.unshift([1, 2]);
      expect(adaptFrame(f).rows[1]).toEqual([
        { value: 2, state: 'value' },
        { value: null, state: 'missing' },
      ]);
    },
  );
  it('rejects malformed column count/length and types', () => {
    expect(() => adaptFrame(frame(undefined, []))).toThrow();
    expect(() => adaptFrame(frame(undefined, [['oops']]))).toThrow();
    const f = frame();
    f.schema.fields.push({ name: 'second', type: 'number' });
    f.data.values.push([1]);
    expect(() => adaptFrame(f)).toThrow();
  });
  it('isolates empty and failed query results', () => {
    expect(adaptResult({ status: 200, frames: [] }).status).toBe('empty');
    expect(adaptResult({ status: 504, frames: [frame()] }).status).toBe('error');
    expect(adaptResult(undefined).status).toBe('error');
    expect(adaptResult({ status: 200, frames: [frame()] }).status).toBe('success');
  });
});
