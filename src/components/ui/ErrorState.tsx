import type { ReactNode } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";

export function ErrorState({
  message,
  description,
  onRetry,
  retrying = false,
  retryLabel = "다시 조회",
  children,
  variant = "panel",
  className = "",
}: {
  variant?: "panel" | "inline";
  message: ReactNode;
  description?: ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  retryLabel?: string;
  children?: ReactNode;
  className?: string;
}) {
  const retryButton = onRetry && (
    <Button
      size="sm"
      onClick={onRetry}
      loading={retrying}
      loadingLabel="조회 중…"
    >
      {retryLabel}
    </Button>
  );

  if (variant === "inline")
    return (
      <div
        role="alert"
        className={`flex items-center gap-2 text-xs text-red ${className}`}
      >
        <Icon name="alert" size={14} />
        <div className="min-w-0 flex-1">
          <div className="truncate">{message}</div>
          {description && <div className="text-text2">{description}</div>}
        </div>
        {retryButton}
        {children}
      </div>
    );

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-xl border border-border bg-card p-5 ${className}`}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-red-tint text-red">
        <Icon name="alert" size={18} />
      </span>
      <div className="min-w-0 flex-1 py-1">
        <div className="text-sm font-medium leading-6 break-words text-text">
          {message}
        </div>
        {description && (
          <div className="mt-1 text-xs leading-5 break-words text-text2">
            {description}
          </div>
        )}
        {(onRetry || children) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text2">
            {retryButton}
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
