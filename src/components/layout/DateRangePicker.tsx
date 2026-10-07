"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import {
  calendarCells,
  dayCount,
  DAY_MS,
  fromIso,
  pickDay,
  rangeText,
  TODAY,
  toIso,
  utcDate,
  type DateRange,
} from "@/lib/date";

const DOW = ["월", "화", "수", "목", "금", "토", "일"];

export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const anchor = fromIso(value.end ?? value.start);
  const [viewYear, setViewYear] = useState(anchor.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(anchor.getUTCMonth());
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // 바깥을 누르면 닫습니다 — 원본의 document 클릭 핸들러와 같은 동작
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("click", onDocClick); document.removeEventListener("keydown", escape); };
  }, [open]);

  const setRange = (from: Date, to: Date) => {
    setDraft({ start: toIso(from), end: toIso(to) });
    setViewYear(to.getUTCFullYear());
    setViewMonth(to.getUTCMonth());
  };

  const presets = [
    { label: "오늘", run: () => setRange(TODAY, TODAY) },
    {
      label: "이번 주",
      run: () => {
        const offset = (TODAY.getUTCDay() + 6) % 7;
        setRange(new Date(TODAY.getTime() - offset * DAY_MS), TODAY);
      },
    },
    { label: "이번 달", run: () => setRange(utcDate(2026, 8, 1), TODAY) },
    { label: "최근 1년", run: () => setRange(utcDate(2025, 8, 14), TODAY) },
  ];

  const cells = calendarCells(viewYear, viewMonth, draft);

  const shiftMonth = (delta: number) => {
    const next = utcDate(viewYear, viewMonth + delta, 1);
    setViewYear(next.getUTCFullYear());
    setViewMonth(next.getUTCMonth());
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!open) { setDraft(value); setViewYear(anchor.getUTCFullYear()); setViewMonth(anchor.getUTCMonth()); }
          setOpen((v) => !v);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="tnum flex h-[30px] cursor-pointer items-center gap-[7px] rounded-md border border-border bg-card px-2.5 text-[12px] whitespace-nowrap text-text hover:bg-hover"
      >
        <span className="text-text3">
          <Icon name="calendar" size={14} />
        </span>
        {rangeText(value)}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="기간 선택"
          onClick={(e) => e.stopPropagation()}
          className="absolute top-9 left-0 z-40 flex w-[316px] flex-col gap-3 rounded-lg border border-border bg-card p-3.5"
        >
          <div className="grid grid-cols-2 gap-1.5">
            {presets.map((p) => (
              <Button key={p.label} onClick={p.run}>
                {p.label}
              </Button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="이전 달"
              className="h-[26px] w-[26px] cursor-pointer rounded-md border-0 bg-transparent text-[14px] text-text2 hover:bg-hover"
            >
              ‹
            </button>
            <span className="tnum text-[13px] font-semibold">
              {viewYear}년 {viewMonth + 1}월
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="다음 달"
              className="h-[26px] w-[26px] cursor-pointer rounded-md border-0 bg-transparent text-[14px] text-text2 hover:bg-hover"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-x-0 gap-y-0.5">
            {DOW.map((d, i) => (
              <span
                key={d}
                className="flex h-[22px] items-center justify-center text-[11px]"
                style={{ color: i >= 5 ? "var(--blue2)" : "var(--text3)" }}
              >
                {d}
              </span>
            ))}
            {cells.map((c) => {
              const edge = c.isStart || c.isEnd;
              return (
                <button
                  key={c.iso}
                  type="button"
                  title={c.iso}
                  onClick={() => setDraft(pickDay(draft, c.iso))}
                  className="tnum h-[30px] cursor-pointer border-0 text-[12px]"
                  style={{
                    background: edge
                      ? "var(--text)"
                      : c.inRange
                        ? "var(--sub)"
                        : "transparent",
                    color: edge
                      ? "var(--card)"
                      : !c.inMonth
                        ? "var(--text3)"
                        : c.isToday
                          ? "var(--blue)"
                          : "var(--text)",
                    borderRadius: edge ? 6 : c.inRange ? 0 : 6,
                    fontWeight: edge || c.isToday ? 600 : 400,
                  }}
                >
                  {c.day}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <span className="text-[12px] text-text3">
              {draft.end
                ? `${dayCount(draft)}일 선택됨`
                : "종료일을 선택하세요"}
            </span>
            <Button
              variant="primary"
              className="px-4"
              disabled={!draft.end}
              onClick={() => { onChange(draft); setOpen(false); triggerRef.current?.focus(); }}
            >
              적용
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
