import { useModalFocus } from '../../components/dialogFocus';
import { useState, type ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Button, Badge, WidgetState } from '../../components/ui';
import { adaptResult } from '../../api/frames';
import type { QueryResult } from '../../api/types';
import s from './Operations.module.css';
export function State<T>({
  query,
  children,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <WidgetState status="loading" />;
  if (query.isError) return <WidgetState status="error" onRetry={() => query.refetch()} />;
  return <>{children(query.data)}</>;
}
export function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return rows.length ? (
    <div className={s.scroll}>
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j}>{v ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <WidgetState status="empty" />
  );
}
export function FrameTable({
  result,
  retry,
  columns,
}: {
  result?: QueryResult;
  retry: () => void;
  columns?: Record<string, string>;
}) {
  const a = adaptResult(result);
  if (a.status !== 'success') return <WidgetState status={a.status} onRetry={retry} />;
  return (
    <>
      {a.frames.map((f, i) => (
        <Table
          key={i}
          headers={f.fields.map((f) => columns?.[f.name] || f.config?.display_name || f.name)}
          rows={f.rows.map((row) =>
            row.map((v, j) =>
              v.state === 'masked' ? (
                <Badge>n&lt;5</Badge>
              ) : v.state !== 'value' ? (
                v.state === 'zero-denominator' ? (
                  '분모 0'
                ) : (
                  '미관측'
                )
              ) : typeof v.value === 'number' ? (
                f.fields[j].config?.unit === 'ratio' ? (
                  `${(v.value * 100).toFixed(1)}%`
                ) : (
                  v.value.toLocaleString('en-US')
                )
              ) : (
                String(v.value)
              ),
            ),
          )}
        />
      ))}
    </>
  );
}
export function AuditDialog({
  target,
  onCancel,
  onSubmit,
}: {
  target: string;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const modalFocus = useModalFocus();
  const [reason, setReason] = useState('');
  const valid = reason.trim().length >= 10 && reason.trim().length <= 500;
  return (
    <dialog {...modalFocus} className={s.dialog} onCancel={onCancel} aria-labelledby="audit-title">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSubmit(reason.trim());
        }}
      >
        <header>
          <h2 id="audit-title">조회 사유 입력</h2>
          <Badge tone="orange">개인 식별 조회</Badge>
        </header>
        <p>
          조회 대상 <code>{target}</code>에는 사용자 식별자가 포함될 수 있습니다.
        </p>
        <p>사유는 조회자 · 시각 · 대상과 함께 감사 로그에 남습니다.</p>
        <label>
          사유 (10–500자)
          <textarea
            autoFocus
            required
            minLength={10}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <small>
          {reason.trim().length}자 · {valid ? '기록 가능' : '10자 이상 입력해 주세요'}
        </small>
        <footer>
          <Button onClick={onCancel}>취소</Button>
          <Button type="submit" variant="primary" disabled={!valid}>
            사유 기록 후 조회
          </Button>
        </footer>
      </form>
    </dialog>
  );
}
export const dateTime = (value?: string | null) =>
  value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Seoul',
        dateStyle: 'short',
        timeStyle: 'medium',
      }).format(new Date(value)) + ' KST'
    : '미관측';
export function Pager({
  hasNext,
  hasPrevious,
  next,
  previous,
}: {
  hasNext: boolean;
  hasPrevious: boolean;
  next: () => void;
  previous: () => void;
}) {
  return (
    <div className={s.pager}>
      <Button size={26} disabled={!hasPrevious} onClick={previous}>
        이전
      </Button>
      <Button size={26} disabled={!hasNext} onClick={next}>
        다음
      </Button>
    </div>
  );
}
