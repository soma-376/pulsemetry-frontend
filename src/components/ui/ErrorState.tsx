import type { ReactNode } from "react";
import { Button } from "./Button";

export function ErrorState({
  message,
  onRetry,
  retrying = false,
  retryLabel = "다시 조회",
  children,
  variant = "panel",
  className = "",
}: {
  variant?: "panel" | "inline";
  message: ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  retryLabel?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`flex items-center gap-3 text-xs text-red ${variant === "inline" ? "flex-nowrap" : "flex-wrap rounded-lg border border-border bg-card p-4"} ${className}`}
    >
      <div
        className={`min-w-0 flex-1 ${variant === "inline" ? "truncate" : ""}`}
      >
        {message}
      </div>
      {onRetry && (
        <Button
          size="sm"
          onClick={onRetry}
          loading={retrying}
          loadingLabel="조회 중…"
        >
          {retryLabel}
        </Button>
      )}
      {children}
    </div>
  );
}
