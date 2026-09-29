export function LoadingSpinner({ className = "size-4" }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-block shrink-0 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin ${className}`} />;
}

export function LoadingState({ message = "불러오는 중입니다…", variant = "panel", className = "" }: {
  message?: string;
  variant?: "panel" | "inline";
  className?: string;
}) {
  const layout = variant === "panel"
    ? "min-h-40 justify-center rounded-lg border border-border bg-card p-6 text-sm text-text2"
    : "text-xs text-text3";
  return <div role="status" className={`flex items-center gap-2 ${layout} ${className}`}>
    <LoadingSpinner className={variant === "inline" ? "size-3" : "size-4"} />
    <span>{message}</span>
  </div>;
}
