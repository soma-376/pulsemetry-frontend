"use client";

import { useId } from "react";
import { LayoutGroup, motion } from "motion/react";

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
};

export type SegmentedControlProps<T extends string> = {
  options: SegmentOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** 접근성 레이블 — 그룹이 무엇을 고르는지 */
  label: string;
  className?: string;
};

/**
 * 세그먼트 토글 (기간 24h/7d/28d/90d, 테마 라이트/다크 등).
 * 선택된 항목은 배경을 텍스트 색으로 채우고 글자는 카드 색으로 뒤집습니다.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: SegmentedControlProps<T>) {
  const id = useId();
  return (
    <LayoutGroup id={id}>
    <div
      role="group"
      aria-label={label}
      className={[
        "flex shrink-0 gap-0.5 rounded-md border border-border bg-sub p-0.5",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className="tnum relative isolate h-6 cursor-pointer rounded border-0 px-2.5 text-[12px] font-medium whitespace-nowrap"
            style={{
              background: "transparent",
              color: active ? "var(--card)" : "var(--text2)",
            }}
          >
            {active && <motion.span layoutId="selection" className="absolute inset-0 -z-10 rounded bg-text" transition={{ type: "spring", stiffness: 460, damping: 36 }} />}
            {o.label}
          </button>
        );
      })}
    </div>
    </LayoutGroup>
  );
}
