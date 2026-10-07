import type { ReactNode } from "react";

/** 페이지 본문과 조회 상태가 같은 최대 너비·좌우 여백을 사용한다. */
export function PageContainer({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-[1440px] px-6 ${className}`}>
      {children}
    </div>
  );
}
