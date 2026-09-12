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
  const needsAudit = queries.some(q => q.metric_id === 'vendor_account_mismatch' || q.metric_id === 'refusals');
  const auditScope = JSON.stringify([scope.role, scope.serialized, queries, requestPatch]);
  const [grant, setGrant] = useState<{ scope: string; reason: string; key: string }>();
  const authorized = !needsAudit || grant?.scope === auditScope;
  const authorize = (reason: string) => setGrant({ scope: auditScope, reason, key: crypto.randomUUID() });
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
      ...(needsAudit ? [authorized ? grant?.key : 'audit-required'] : []),
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
        needsAudit && authorized ? grant?.reason : undefined,
      ),
    enabled: visible && !!scope.options.data && authorized,
    ...(needsAudit ? { retry: false, gcTime: 0 } : {}),
    refetchInterval: !needsAudit && visible && scope.auto ? 300000 : false,
  });
  return { ref, query, scope, needsAudit, authorized, authorize };
}
