import { expect, it } from 'vitest';
import { readFilters, scopeFilters, writeFilters } from './filters';
it('normalizes invalid filters without forwarding personal identifiers', () => {
  const v = readFilters(
    new URLSearchParams('from=bad&compare=bad&products=codex,evil,codex&member_ids=secret&tz=UTC'),
  );
  expect(v.from).toBe('now-7d');
  expect(v.tz).toBe('Asia/Seoul');
  expect(v.filters?.products).toEqual(['codex']);
  expect(v.filters?.member_ids).toBeUndefined();
});
it('round-trips URL filters with stable ordering', () => {
  const p = new URLSearchParams(
    'from=now-28d&to=now&compare=previous_period&price=contract&teams=b,a&models=gpt-5',
  );
  expect(writeFilters(readFilters(writeFilters(readFilters(p)))).toString()).toBe(
    writeFilters(readFilters(p)).toString(),
  );
});
it('removes inaccessible teams before queries and constrains admin all', () => {
  const v = scopeFilters(
    readFilters(new URLSearchParams('teams=other&models=unknown')),
    { teams: [{ team_id: 'mine' }, { team_id: 'other' }], models: [] },
    { role: 'admin', accessible_team_ids: ['mine'] },
  );
  expect(v.filters?.team_ids).toEqual(['mine']);
  expect(v.filters?.models).toEqual([]);
});
it('preserves owner all and explicit custom KST range', () => {
  const v = readFilters(
    new URLSearchParams({ from: '2026-09-01T00:00:00+09:00', to: '2026-09-07T00:00:00+09:00' }),
  );
  expect(scopeFilters(v, {}, { role: 'owner' }).filters?.team_ids).toEqual([]);
  expect(v.from).toContain('+09:00');
});
it('rejects reversed absolute range', () =>
  expect(
    readFilters(new URLSearchParams({ from: '2026-09-07T00:00:00Z', to: '2026-09-01T00:00:00Z' }))
      .from,
  ).toBe('now-7d'));
