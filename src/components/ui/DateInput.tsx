"use client";

import { useId, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Input } from "./Input";
import { Select } from "./Select";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { calendarCells, currentDateIso, DAY_MS, fromIso, toIso, utcDate } from "@/lib/date";
import { dateInputError, dateInputText, dateInputValue } from "@/lib/date-input";

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

export function DateInput({ label, value, min, onChange }: { label: string; value: string; min?: string; onChange: (value: string) => void }) {
  const today = currentDateIso();
  const initialDate = fromIso(min && min > today ? min : today);
  const minDate = min ? fromIso(min) : null;
  const isDisabled = (iso: string) => iso < (min ?? "1000-01-01") || iso > "9999-12-31";
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const caret = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const [view, setView] = useState({ year: initialDate.getUTCFullYear(), month: initialDate.getUTCMonth() });
  const [cursor, setCursor] = useState(toIso(initialDate));
  const validation = dateInputError(value, min);
  const error = touched || value.replace(/\D/g, "").length === 8 ? validation : null;
  const selected = !validation && value ? value : "";
  const cells = calendarCells(view.year, view.month, { start: selected, end: selected });
  const tabDay = cells.some((cell) => cell.iso === cursor && !isDisabled(cell.iso)) ? cursor : cells.find((cell) => cell.inMonth && !isDisabled(cell.iso))?.iso;
  const years = Array.from(new Set([
    ...Array.from({ length: 41 }, (_, index) => initialDate.getUTCFullYear() - 10 + index), view.year,
  ])).filter((year) => year >= (minDate?.getUTCFullYear() ?? 1000)).sort((a, b) => a - b);
  const monthDisabled = (year: number, month: number) => !!min && toIso(utcDate(year, month + 1, 0)) < min;

  const close = () => {
    popup.current?.hidePopover();
    setOpen(false);
    trigger.current?.focus();
  };

  useLayoutEffect(() => {
    if (caret.current === null || !input.current) return;
    const count = caret.current;
    let offset = 0;
    let digits = 0;
    const text = dateInputText(value);
    while (offset < text.length && digits < count) {
      if (/\d/.test(text[offset])) digits++;
      offset++;
    }
    input.current.setSelectionRange(offset, offset);
    caret.current = null;
  }, [value]);

  // 네이티브 popover의 top layer를 사용해 드로어의 스크롤 영역 밖에서도 달력이 보이게 합니다.
  useLayoutEffect(() => {
    const element = popup.current;
    if (!open || !element) return;
    if (!element.matches(":popover-open")) element.showPopover();
    const place = () => {
      if (!root.current) return;
      const anchor = root.current.getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      const below = anchor.bottom + 6;
      const top = below + bounds.height <= innerHeight - 8 ? below : anchor.top - bounds.height - 6;
      element.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - bounds.width - 8))}px`;
      element.style.top = `${Math.max(8, Math.min(top, innerHeight - bounds.height - 8))}px`;
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, view.year, view.month]);

  useLayoutEffect(() => {
    if (open) popup.current?.querySelector<HTMLButtonElement>(`[data-date="${cursor}"]`)?.focus();
  }, [open, cursor]);

  const changeText = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    let digits = raw.replace(/\D/g, "").slice(0, 8);
    let count = raw.slice(0, event.target.selectionStart ?? raw.length).replace(/\D/g, "").length;
    // 구분점 앞뒤에서 지워도 같은 점이 다시 생기며 커서가 멈추지 않도록 합니다.
    const inputType = (event.nativeEvent as InputEvent).inputType;
    if (digits === value.replace(/\D/g, "") && inputType?.startsWith("deleteContent")) {
      const index = inputType === "deleteContentBackward" ? count - 1 : count;
      if (index >= 0) digits = digits.slice(0, index) + digits.slice(index + 1);
      if (inputType === "deleteContentBackward") count = Math.max(0, count - 1);
    }
    caret.current = count;
    onChange(dateInputValue(digits));
  };

  const shiftMonth = (delta: number) => {
    const date = utcDate(view.year, view.month + delta, 1);
    if (monthDisabled(date.getUTCFullYear(), date.getUTCMonth())) return;
    if (date.getUTCFullYear() >= 1000 && date.getUTCFullYear() <= 9999) setView({ year: date.getUTCFullYear(), month: date.getUTCMonth() });
  };

  const moveDay = (event: KeyboardEvent<HTMLButtonElement>, iso: string) => {
    const date = fromIso(iso);
    const weekday = (date.getUTCDay() + 6) % 7;
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -weekday, End: 6 - weekday };
    if (!(event.key in offsets)) return;
    event.preventDefault();
    const next = new Date(date.getTime() + offsets[event.key] * DAY_MS);
    if (next.getUTCFullYear() < 1000 || next.getUTCFullYear() > 9999) return;
    if (isDisabled(toIso(next))) return;
    setView({ year: next.getUTCFullYear(), month: next.getUTCMonth() });
    setCursor(toIso(next));
  };

  const clear = () => {
    onChange("");
    setTouched(false);
    popup.current?.hidePopover();
    setOpen(false);
    input.current?.focus();
  };

  return <div className="flex min-w-0 flex-col gap-1 text-[11.5px] text-text2">
    <label htmlFor={id}>{label}</label>
    <div ref={root} className="relative" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { popup.current?.hidePopover(); setOpen(false); }
    }} onKeyDown={(event) => {
      if (open && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
    }}>
      <Input ref={input} id={id} type="text" inputMode="numeric" autoComplete="off" placeholder="YYYY.MM.DD" value={dateInputText(value)}
        onChange={changeText} onBlur={() => setTouched(true)} aria-invalid={!!error} aria-describedby={`${id}-hint`}
        className="tnum w-full pr-[68px]" />
      <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
        {value && <button type="button" onClick={clear} aria-label={`${label} 지우기`} className="flex size-6 cursor-pointer items-center justify-center rounded text-base text-text3 hover:bg-hover hover:text-text">×</button>}
        <button ref={trigger} type="button" aria-label={`${label} 달력 열기`} aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-calendar`}
          className="flex size-6 cursor-pointer items-center justify-center rounded text-text3 hover:bg-hover hover:text-text" onClick={() => {
            if (open) { close(); return; }
            const anchor = selected ? fromIso(selected) : initialDate;
            setView({ year: anchor.getUTCFullYear(), month: anchor.getUTCMonth() });
            setCursor(toIso(anchor));
            setOpen(true);
          }}><Icon name="calendar" size={16} /></button>
      </div>
      <div ref={popup} id={`${id}-calendar`} popover="auto" role="dialog" aria-label={`${label} 선택`}
        onToggle={(event) => { if (event.newState === "closed") setOpen(false); }}
        className="fixed inset-auto m-0 max-h-[calc(100dvh-16px)] w-[300px] max-w-[calc(100vw-16px)] overflow-y-auto rounded-lg border border-border bg-card p-3 text-text shadow-lg">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button size="sm" aria-label="이전 달" disabled={(view.year === 1000 && view.month === 0) || monthDisabled(view.year, view.month - 1)} onClick={() => shiftMonth(-1)}>‹</Button>
          <Select aria-label={`${label} 연도`} value={view.year} onChange={(event) => {
            const year = Number(event.target.value);
            const month = monthDisabled(year, view.month) ? minDate!.getUTCMonth() : view.month;
            setView({ year, month });
          }}>{years.map((year) => <option key={year} value={year}>{year}년</option>)}</Select>
          <Select aria-label={`${label} 월`} value={view.month} onChange={(event) => setView({ ...view, month: Number(event.target.value) })}>{Array.from({ length: 12 }, (_, month) => <option key={month} value={month} disabled={monthDisabled(view.year, month)}>{month + 1}월</option>)}</Select>
          <Button size="sm" aria-label="다음 달" disabled={view.year === 9999 && view.month === 11} onClick={() => shiftMonth(1)}>›</Button>
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {WEEKDAYS.map((day, index) => <span key={day} className={`py-1 text-center text-[11px] ${index >= 5 ? "text-blue2" : "text-text3"}`}>{day}</span>)}
          {cells.map((cell) => <button key={cell.iso} type="button" data-date={cell.iso} tabIndex={cell.iso === tabDay ? 0 : -1}
            disabled={isDisabled(cell.iso)}
            aria-label={dateInputText(cell.iso)} aria-pressed={cell.iso === selected} aria-current={cell.iso === today ? "date" : undefined}
            onKeyDown={(event) => moveDay(event, cell.iso)} onClick={() => { onChange(cell.iso); setTouched(false); close(); }}
            className={`tnum h-8 cursor-pointer rounded text-xs focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-text disabled:cursor-not-allowed disabled:opacity-30 ${cell.iso === selected ? "bg-text font-semibold text-card" : "enabled:hover:bg-hover"} ${cell.iso === selected ? "" : !cell.inMonth ? "text-text3" : cell.iso === today ? "font-semibold text-blue" : "text-text"}`}>
            {cell.day}
          </button>)}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
          <Button size="sm" disabled={!value} onClick={clear}>날짜 지우기</Button><Button size="sm" onClick={close}>닫기</Button>
        </div>
      </div>
    </div>
    <p id={`${id}-hint`} aria-live="polite" className={`text-[11px] ${error ? "text-red" : "text-text3"}`}>{error ?? "직접 입력하거나 달력에서 선택하세요 · 미정이면 비워두세요"}</p>
  </div>;
}
