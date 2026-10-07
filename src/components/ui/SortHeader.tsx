"use client";

import { useId } from "react";
import type { SortDirection } from "@/lib/sort";

export function SortHeader({ label, direction, initial = "asc", align = "left", disabled = false, onClick }: {
  label: string;
  direction?: SortDirection;
  initial?: SortDirection;
  align?: "left" | "right";
  disabled?: boolean;
  onClick: () => void;
}) {
  const hintId = useId();
  const next = direction ? direction === "asc" ? "desc" : "asc" : initial;
  const order = (value: SortDirection) => value === "asc" ? "오름차순" : "내림차순";
  return <button type="button" onClick={onClick} disabled={disabled} aria-label={`${label} 정렬`} aria-describedby={hintId}
    className={`flex min-w-0 cursor-pointer items-center gap-1 rounded-sm py-1 text-[11px] hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text disabled:cursor-default disabled:opacity-50 ${align === "right" ? "justify-end text-right" : "text-left"} ${direction ? "font-semibold text-text" : "text-text3"}`}>
    <span>{label}</span>
    <span aria-hidden="true" className="w-3 shrink-0 text-center">{disabled ? "" : direction === "asc" ? "↑" : direction === "desc" ? "↓" : "↕"}</span>
    <span id={hintId} className="sr-only">{disabled ? "비교 데이터가 없어 정렬할 수 없습니다." : `${direction ? `${order(direction)} 정렬 중. ` : ""}클릭하면 ${order(next)}으로 정렬합니다.`}</span>
  </button>;
}
