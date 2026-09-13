import { expect, it } from 'vitest';
import {
  hasMaskedFrames,
  rerunInput,
  resultFilters,
  resultRestricted,
  shareUrl,
} from './resultModel';
import type { Run } from '../../api/scenarios';
const team = '11111111-1111-4111-8111-111111111111';
const run: Run = {
  run_id: 'one',
  status: 'succeeded',
  params: { from: 'now-28d', to: 'now', moving_avg_days: 7 },
  resolved_from: '2026-08-10T00:00:00Z',
  resolved_to: '2026-09-07T00:00:00Z',
  result: {
    target_page: 'P1',
    applied_filters: { from: 'now-28d', to: 'now', team_ids: [team], price_basis: 'contract' },
  },
};
it('accepts flattened and nested filters and excludes personal dimensions', () => {
  expect(resultFilters(run).filters?.team_ids).toEqual([team]);
  const nested = {
    ...run,
    result: {
      ...run.result,
      applied_filters: {
        ...run.result?.applied_filters,
        filters: {
          team_ids: [team],
          member_ids: ['secret'],
          models: ['test'],
          products: ['codex', 'invalid'],
        },
      },
    },
  };
  expect(resultFilters(nested).filters).toEqual({
    team_ids: [team],
    models: ['test'],
    products: ['codex'],
  });
});
it('reopens relative with original parameters and price without mutating the run', () => {
  const input = rerunInput(run);
  expect(input.price_basis).toBe('contract');
  expect(input.params.from).toBe('now-28d');
  input.params.from = 'now-7d';
  expect(run.params?.from).toBe('now-28d');
});
it('enforces admin team and page scope before rendering shared results', () => {
  expect(resultRestricted(run, 'admin', [team])).toBe(false);
  expect(resultRestricted(run, 'admin', [])).toBe(true);
  expect(
    resultRestricted({ ...run, result: { ...run.result, target_page: 'P3' } }, 'admin', [team]),
  ).toBe(true);
  expect(
    resultRestricted({ ...run, result: { ...run.result, applied_filters: {} } }, 'admin', [team]),
  ).toBe(true);
  expect(resultRestricted(run, 'owner', [])).toBe(false);
});
it('detects masked numeric cells and generates only local authenticated run links', () => {
  const masked: Run = {
    ...run,
    result: {
      ...run.result,
      frames: {
        cost: {
          status: 200,
          frames: [
            {
              schema: {
                ref_id: 'A',
                metric_id: 'cost',
                frame_type: 'scalar',
                fields: [{ name: 'value', type: 'number', config: { suppressed: true } }],
              },
              data: { values: [[999999]] },
            },
          ],
        },
      },
    },
  };
  expect(hasMaskedFrames(masked)).toBe(true);
  expect(shareUrl('a/b', 'https://console.example')).toBe('https://console.example/runs/a%2Fb');
});
