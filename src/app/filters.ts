import type { FilterOptions, Profile, QueryRequest } from '../api/types';
export type Filters = Omit<QueryRequest, 'queries'>;
const presets = ['now-24h', 'now-7d', 'now-28d', 'now-90d'];
const unique = (s: string | null) => [...new Set((s || '').split(',').filter(Boolean))].sort();
function time(value: string | null, fallback: string) {
  return value &&
    (/^now(?:-\d+[smhdwM])?(?:\/[dwM])?$/.test(value) ||
      (/^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value))))
    ? value
    : fallback;
}
export function readFilters(search: URLSearchParams): Filters {
  let from = time(search.get('from'), 'now-7d'),
    to = time(search.get('to'), 'now');
  if (!from.startsWith('now') && !to.startsWith('now') && Date.parse(from) >= Date.parse(to)) {
    from = 'now-7d';
    to = 'now';
  }
  const compare = search.get('compare');
  return {
    from,
    to,
    tz: 'Asia/Seoul',
    compare: compare === 'previous_period' || compare === 'previous_week' ? compare : 'none',
    price_basis: search.get('price') === 'contract' ? 'contract' : 'list',
    filters: {
      team_ids: unique(search.get('teams')),
      products: unique(search.get('products')).filter(
        (p): p is 'claude_code' | 'codex' => p === 'claude_code' || p === 'codex',
      ),
      models: unique(search.get('models')),
    },
  };
}
export function scopeFilters(value: Filters, options: FilterOptions, profile: Profile): Filters {
  const teams = (options.teams || []).flatMap((t) =>
    t.team_id && (profile.role === 'owner' || profile.accessible_team_ids?.includes(t.team_id))
      ? [t.team_id]
      : [],
  );
  const selected = value.filters?.team_ids?.filter((t) => teams.includes(t)) || [];
  return {
    ...value,
    filters: {
      team_ids: selected.length ? selected : profile.role === 'admin' ? teams : [],
      products: value.filters?.products?.filter((p) => options.products?.includes(p)) || [],
      models:
        value.filters?.models?.filter((m) => options.models?.some((o) => o.model === m)) || [],
    },
  };
}
export function writeFilters(value: Filters) {
  const p = new URLSearchParams({
    from: value.from,
    to: value.to,
    compare: value.compare || 'none',
    price: value.price_basis || 'list',
  });
  if (value.filters?.team_ids?.length) p.set('teams', [...value.filters.team_ids].sort().join(','));
  if (value.filters?.products?.length)
    p.set('products', [...value.filters.products].sort().join(','));
  if (value.filters?.models?.length) p.set('models', [...value.filters.models].sort().join(','));
  return p;
}
export { presets };
