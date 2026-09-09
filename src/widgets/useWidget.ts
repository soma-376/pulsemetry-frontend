import { completedWeeks } from './time';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { QueryRequest } from '../api/types';
import { useScopedFilters } from '../app/filterContext';
export function useWidget(
  id: string,
  queries: QueryRequest['queries'],
  recentWeeks = false,
  requestPatch?: Partial<QueryRequest>,
) {
  const scope = useScopedFilters();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: '0px',
    });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const query = useQuery({
    queryKey: [
      'widget',
      id,
      scope.role,
      scope.serialized,
      ...(requestPatch ? [JSON.stringify(requestPatch)] : []),
    ],
    queryFn: ({ signal }) =>
      api.query(
        {
          ...scope.value,
          ...(recentWeeks ? completedWeeks(scope.value.to) : {}),
          ...requestPatch,
          queries,
        },
        signal,
      ),
    enabled: visible && !!scope.options.data,
    refetchInterval: visible && scope.auto ? 300000 : false,
  });
  return { ref, query, scope };
}
