import type { ReactNode } from "react";
import { Icon } from "./Icon";

export function EmptyState({
  message,
  description,
  action,
  variant = "empty",
  className = "",
}: {
  message: string;
  description?: string;
  action?: ReactNode;
  variant?: "empty" | "not-connected";
  className?: string;
}) {
  const notConnected = variant === "not-connected";
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-10 text-center ${className}`}
    >
      <span
        className={`mb-4 flex size-11 shrink-0 items-center justify-center rounded-xl ${notConnected ? "bg-blue-tint text-blue" : "bg-sub text-text3"}`}
      >
        <Icon name={notConnected ? "link" : "inbox"} size={22} />
      </span>
      <p className="max-w-sm text-sm font-medium leading-6 break-words text-text">
        {message}
      </p>
      {description && (
        <p className="mt-1 max-w-sm text-xs leading-5 break-words text-text2">
          {description}
        </p>
      )}
      {action && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>
      )}
    </div>
  );
}
