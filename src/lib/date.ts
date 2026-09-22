/**
 * 날짜 유틸 — 전부 UTC 기준입니다.
 *
 * 테넌트 기본 타임존은 Asia/Seoul 이지만, 달력 격자는 "일자"만 다루므로
 * 로컬 타임존이 섞이면 하루가 밀립니다. Date.UTC 로만 만들고 ISO 문자열로 주고받습니다.
 */

export const DAY_MS = 86_400_000;

const pad2 = (n: number) => String(n).padStart(2, "0");

export const utcDate = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m, d));

export const toIso = (d: Date) =>
  `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

export function fromIso(v: string) {
  const [y, m, d] = v.split("-").map(Number);
  return utcDate(y, m - 1, d);
}

/** 실제 오늘의 일자. 계약 입력은 목 데이터 시점이 아닌 조직 기본 시간대를 따릅니다. */
export function currentDateIso(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** 목 데이터 기준 "오늘". 실제 연동 시 서버 시각으로 교체합니다 */
export const TODAY = utcDate(2026, 8, 13);

export type DateRange = { start: string; end: string | null };

/** "8.31" / 해가 바뀌면 "2026.8.31" */
export function shortDate(iso: string, withYear = false) {
  const d = fromIso(iso);
  return (
    (withYear ? `${d.getUTCFullYear()}.` : "") +
    `${d.getUTCMonth() + 1}.${d.getUTCDate()}`
  );
}

export function rangeText(range: DateRange) {
  const start = range.start.replaceAll("-", ".");
  const end = range.end?.replaceAll("-", ".") ?? "…";
  return `${start} ~ ${end}`;
}

export function dayCount(range: DateRange) {
  if (!range.end) return 1;
  return (
    Math.round(
      (fromIso(range.end).getTime() - fromIso(range.start).getTime()) / DAY_MS,
    ) + 1
  );
}

export type CalendarCell = {
  iso: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isStart: boolean;
  isEnd: boolean;
  inRange: boolean;
};

/** 월요일 시작 달력 격자 (필요한 만큼만 주를 만듭니다) */
export function calendarCells(
  year: number,
  month: number,
  range: DateRange,
): CalendarCell[] {
  const first = utcDate(year, month, 1);
  const lead = (first.getUTCDay() + 6) % 7; // 월=0
  const gridStart = utcDate(year, month, 1 - lead);
  const lastDay = utcDate(year, month + 1, 0).getUTCDate();
  const cellCount = Math.ceil((lead + lastDay) / 7) * 7;

  const startMs = fromIso(range.start).getTime();
  const endMs = range.end ? fromIso(range.end).getTime() : null;

  return Array.from({ length: cellCount }, (_, i) => {
    const d = new Date(gridStart.getTime() + i * DAY_MS);
    const ms = d.getTime();
    const isStart = ms === startMs;
    const isEnd = endMs !== null && ms === endMs;
    return {
      iso: toIso(d),
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month,
      isToday: ms === TODAY.getTime(),
      isStart,
      isEnd,
      inRange: endMs !== null && ms > startMs && ms < endMs,
    };
  });
}

/**
 * 날짜 하나를 클릭했을 때의 다음 범위.
 * 범위가 완성된 상태면 새로 시작하고, 시작일보다 앞을 찍으면 뒤집습니다.
 */
export function pickDay(current: DateRange, iso: string): DateRange {
  if (current.end) return { start: iso, end: null };
  return fromIso(iso) < fromIso(current.start)
    ? { start: iso, end: current.start }
    : { start: current.start, end: iso };
}
