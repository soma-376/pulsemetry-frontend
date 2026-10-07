import type { ReactNode } from "react";

/** 카드 — 개요의 KPI·위젯이 공유하는 껍데기 */
export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={[
        "flex min-w-0 flex-col rounded-lg border border-border bg-card p-4",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

export type WidgetProps = {
  id?: string;
  /** 스크린리더용 위젯 이름 */
  label: string;
  title: string;
  /** 제목 옆 회색 보조 문구 */
  note?: string;
  /** 지표 정의 — 제목에 title 속성으로 붙습니다 */
  def?: string;
  /** 헤더 우측 영역 (범례·링크 등) */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
};

/** 제목 줄을 가진 위젯 카드 */
export function Widget({
  id,
  label,
  title,
  note,
  def,
  action,
  className,
  children,
}: WidgetProps) {
  return (
    <section
      id={id}
      aria-label={label}
      className={[
        "flex min-w-0 flex-col rounded-lg border border-border bg-card p-4",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span title={def} className="text-[13px] font-semibold">
            {title}
          </span>
          {note && (
            <span className="ml-1 text-[11px] text-text3">{note}</span>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
