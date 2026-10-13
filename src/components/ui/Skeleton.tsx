import type { ReactNode } from "react";

/** Decorative placeholders only; SkeletonRegion announces the loading state once. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`max-w-full rounded bg-border motion-safe:animate-pulse ${className}`}
    />
  );
}

export function SkeletonRegion({
  message,
  children,
  className = "",
}: {
  message: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role="status" className={`min-w-0 ${className}`}>
      <span className="sr-only">{message}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

export function SkeletonPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`min-w-0 rounded-lg border border-border bg-card p-4 ${className}`}
    >
      {children}
    </div>
  );
}

export function SkeletonMetric({ compact = false }: { compact?: boolean }) {
  return (
    <SkeletonPanel>
      <Skeleton className="h-3 w-20" />
      <Skeleton className={`${compact ? "h-5" : "h-7"} my-3 w-24`} />
      <Skeleton className="h-2.5 w-32" />
    </SkeletonPanel>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 py-3.5">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="ml-auto h-3 w-1/5" />
          <Skeleton className="h-3 w-1/6" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart({
  className = "h-[260px]",
}: {
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-3 w-28" />
      <Skeleton className={`w-full ${className}`} />
      <div className="flex justify-between">
        <Skeleton className="h-2.5 w-12" />
        <Skeleton className="h-2.5 w-12" />
        <Skeleton className="h-2.5 w-12" />
      </div>
    </div>
  );
}
