import { DAY_MS, fromIso, toIso } from "@/lib/date";
import type { CompareKey } from "@/types/domain";

export type DashboardFilters = {
  dates: { start: string; end: string };
  compare: CompareKey;
};
const FILTER_KEYS = ["startDate", "endDate", "compare"] as const;

export function hasPeriodFilters(pathname: string): boolean {
  return pathname === "/overview" || pathname === "/teams";
}

export function defaultDashboardFilters(todayIso: string): DashboardFilters {
  const today = fromIso(todayIso);
  const offset = (today.getUTCDay() + 6) % 7;
  return {
    dates: {
      start: toIso(new Date(today.getTime() - offset * DAY_MS)),
      end: todayIso,
    },
    compare: "prev_week",
  };
}

/** 백엔드와 같은 실제 날짜·종료일 포함 1~366일 조건. 미래 날짜도 조회할 수 있다. */
export function readFilterQuery(
  params: Pick<URLSearchParams, "getAll">,
  todayIso: string,
): DashboardFilters {
  const defaults = defaultDashboardFilters(todayIso);
  const one = (key: string) => {
    const values = params.getAll(key);
    return values.length === 1 ? values[0] : null;
  };
  const start = one("startDate"),
    end = one("endDate"),
    compare = one("compare");
  const validDate = (value: string | null): value is string =>
    !!value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    toIso(fromIso(value)) === value;
  const days =
    start && end ? (Date.parse(end) - Date.parse(start)) / DAY_MS + 1 : NaN;
  return {
    dates:
      validDate(start) && validDate(end) && days >= 1 && days <= 366
        ? { start, end }
        : defaults.dates,
    compare:
      compare === "prev_week" || compare === "prev_period" || compare === "none"
        ? compare
        : defaults.compare,
  };
}

/** 분석 페이지의 명시된 URL이 우선하며, 조건 없는 이동에서는 마지막 선택을 복원한다. */
export function resolveDashboardFilters(
  pathname: string,
  params: Pick<URLSearchParams, "getAll">,
  todayIso: string,
  remembered: DashboardFilters,
): DashboardFilters {
  return hasPeriodFilters(pathname) &&
    FILTER_KEYS.some((key) => params.getAll(key).length > 0)
    ? readFilterQuery(params, todayIso)
    : remembered;
}

/** 분석 페이지에만 조건을 옮긴다. 목적지의 vendor·team·invite와 해시는 유지한다. */
export function withFilterQuery(
  href: string,
  filters: DashboardFilters,
): string {
  const url = new URL(href, "http://dashboard.local");
  if (hasPeriodFilters(url.pathname)) {
    url.searchParams.set("startDate", filters.dates.start);
    url.searchParams.set("endDate", filters.dates.end);
    url.searchParams.set("compare", filters.compare);
  } else {
    FILTER_KEYS.forEach((key) => url.searchParams.delete(key));
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
