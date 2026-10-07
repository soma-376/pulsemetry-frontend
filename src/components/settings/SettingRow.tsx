import type { ReactNode } from "react";

/**
 * 설정 한 줄 — 왼쪽에 "무엇을 정하는가", 오른쪽에 조작 장치.
 *
 * 설명이 옵션이 아니라 필수인 이유: 설정 화면의 위험은 이름만 보고 누르는 것입니다.
 * 좁아지면 조작 장치가 설명 아래로 내려가 왼쪽 정렬됩니다.
 */
export function SettingRow({
  title,
  badge,
  note,
  noteColor = "var(--text2)",
  children,
  first = false,
}: {
  title: string;
  badge?: ReactNode;
  note: string;
  noteColor?: string;
  children: ReactNode;
  /** 첫 줄은 위 구분선을 그리지 않습니다 */
  first?: boolean;
}) {
  return (
    <div
      className={[
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3.5",
        "@max-[480px]:grid-cols-[minmax(0,1fr)] @max-[480px]:[&>*:last-child]:justify-self-start",
        first ? "" : "border-t border-border",
      ].join(" ")}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12.5px] font-semibold">{title}</span>
          {badge}
        </div>
        <span className="pretty text-[11.5px]" style={{ color: noteColor }}>
          {note}
        </span>
      </div>
      {children}
    </div>
  );
}

/** 설정 섹션 — 제목 + 카드 하나 */
export function SettingSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-label={title} className="flex flex-col gap-2.5">
      <h2 className="text-[13px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}
