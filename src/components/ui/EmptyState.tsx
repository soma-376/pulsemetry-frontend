import type { ReactNode } from "react";

export function EmptyState({
  message,
  description,
  action,
  className = "",
}: {
  message: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={`flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-6 text-center text-sm text-text2 ${className}`}
    >
      <p>{message}</p>
      {description && <p className="text-xs text-text3">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
