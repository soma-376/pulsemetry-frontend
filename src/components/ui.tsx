import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import s from './ui.module.css';

export type Tone = 'blue' | 'purple' | 'green' | 'orange' | 'red' | 'gray';
type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 26 | 30 | 32 | 36;
};
export function Button({
  variant = 'secondary',
  size = 30,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`${s.button} ${s[variant]} ${className}`}
      style={{ height: size, ...props.style }}
    />
  );
}

export function Badge({
  children,
  tone = 'gray',
  solid = false,
}: {
  children: ReactNode;
  tone?: Tone;
  solid?: boolean;
}) {
  return (
    <span className={`${s.badge} ${solid ? s.solid : ''}`} data-tone={tone}>
      {children}
    </span>
  );
}

export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button className={s.info} type="button" aria-label={label}>
          i
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className={s.tooltip} sideOffset={8}>
          {children}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

type KpiCardProps = {
  label: string;
  value: string;
  unit?: string;
  delta?: { text: string; tone: 'green' | 'red' | 'gray'; comparison: string };
  secondary?: { value: string; label: string };
  caption?: string;
  definition: string;
};
export function KpiCard({
  label,
  value,
  unit,
  delta,
  secondary,
  caption,
  definition,
}: KpiCardProps) {
  const id = useId();
  return (
    <article className={s.kpi} aria-labelledby={id} data-component="kpi-card">
      <header className={s.row}>
        <h3 id={id} className={s.kpiLabel}>
          {label}
        </h3>
        <InfoTip label={`${label} 정의`}>{definition}</InfoTip>
      </header>
      <div className={s.valueRow}>
        <span className={s.kpiValue}>{value}</span>
        {unit && <span className={s.unit}>{unit}</span>}
      </div>
      {secondary && (
        <div className={s.valueRow}>
          <span className={s.secondaryValue}>{secondary.value}</span>
          <span className={s.caption}>{secondary.label}</span>
        </div>
      )}
      {delta && (
        <p className={s.delta}>
          <span data-tone={delta.tone}>{delta.text}</span>
          <span>{delta.comparison}</span>
        </p>
      )}
      {caption && <p className={s.caption}>{caption}</p>}
    </article>
  );
}

export function WidgetCard({
  title,
  definition,
  caption,
  children,
  emphasis = 'default',
  action,
  subtitle,
}: {
  title: string;
  definition?: string;
  caption?: string;
  children: ReactNode;
  subtitle?: string;
  emphasis?: 'default' | 'highlighted' | 'dimmed';
  action?: ReactNode;
}) {
  const id = useId();
  return (
    <article className={`${s.widget} ${s[emphasis]}`} aria-labelledby={id}>
      <header className={s.widgetHeader}>
        <h3 id={id}>{title}</h3>
        {definition && <InfoTip label={`${title} 정의`}>{definition}</InfoTip>}
        <span className={s.caption}>{subtitle}</span>
        <span className={s.action}>{action}</span>
      </header>
      <div className={s.widgetBody}>{children}</div>
      {caption && <p className={s.caption}>{caption}</p>}
    </article>
  );
}

export type WidgetStatus = 'loading' | 'empty' | 'error' | 'masked';
export function WidgetState({ status, onRetry }: { status: WidgetStatus; onRetry?: () => void }) {
  if (status === 'loading')
    return (
      <div className={s.state} role="status">
        <div className={s.skeleton} />
        <span>불러오는 중…</span>
      </div>
    );
  if (status === 'error')
    return (
      <div className={s.state} role="alert">
        <p className={s.error}>쿼리에 실패했습니다</p>
        <p>기간을 줄이거나 잠시 후 다시 시도해 주세요.</p>
        {onRetry && <Button onClick={onRetry}>재시도</Button>}
      </div>
    );
  if (status === 'masked')
    return (
      <div className={`${s.state} ${s.masked}`}>
        <Badge>n&lt;5</Badge>
        <p>최소 집계 단위 미만</p>
        <span>개인 보호를 위해 값을 표시하지 않습니다.</span>
      </div>
    );
  return (
    <div className={s.state}>
      <p>이 기간에 관측된 데이터가 없습니다</p>
      <span>미관측은 미사용을 의미하지 않습니다.</span>
    </div>
  );
}
