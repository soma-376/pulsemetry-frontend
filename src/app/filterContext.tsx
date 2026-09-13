import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from './auth';
import { readFilters, scopeFilters, writeFilters, type Filters } from './filters';
function useFilterState() {
  const { profile } = useAuth();
  const [search, setSearch] = useSearchParams();
  const raw = readFilters(search);
  const [auto, setAuto] = useState(false);
  const options = useQuery({
    queryKey: ['filters', profile?.member_id, profile?.role, raw.from, raw.to],
    queryFn: ({ signal }) => api.filters(raw.from, raw.to, signal),
    enabled: !!profile,
  });
  const value = options.data && profile ? scopeFilters(raw, options.data, profile) : raw;
  const serialized = writeFilters(value).toString();
  useEffect(() => {
    if (
      options.data &&
      serialized !== search.toString() &&
      window.location.search.slice(1) === search.toString()
    )
      setSearch(serialized, { replace: true });
  }, [serialized, options.data, search, setSearch]);
  return {
    value,
    serialized,
    options,
    auto,
    setAuto,
    role: profile?.role,
    update: (patch: Partial<Filters>) => setSearch(writeFilters({ ...value, ...patch })),
  };
}
const FilterContext = createContext<ReturnType<typeof useFilterState> | null>(null);
export function FilterProvider({ children }: { children: ReactNode }) {
  const value = useFilterState();
  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}
export function useScopedFilters() {
  const context = useContext(FilterContext);
  if (!context) throw new Error('FilterProvider가 필요합니다.');
  return context;
}
