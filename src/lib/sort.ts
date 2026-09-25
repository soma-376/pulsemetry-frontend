export type SortDirection = "asc" | "desc";
export type SortState<Key extends string> = { key: Key; direction: SortDirection };
export type SortValue = string | number | null | undefined;

const collator = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });
const missing = (value: SortValue) => value == null || value === "" || (typeof value === "number" && !Number.isFinite(value));

export function nextSort<Key extends string>(current: SortState<Key>, key: Key, initial: SortDirection): SortState<Key> {
  return { key, direction: current.key === key ? current.direction === "asc" ? "desc" : "asc" : initial };
}

/** 표시 문자열 대신 원본 값으로 비교합니다. 누락값은 양방향 모두 마지막에 둡니다. */
export function sortRows<Row>(rows: readonly Row[], value: (row: Row) => SortValue, direction: SortDirection, identity: (row: Row) => string): Row[] {
  return [...rows].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    const leftMissing = missing(left);
    const rightMissing = missing(right);
    if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
    const compared = leftMissing ? 0 : typeof left === "number" && typeof right === "number"
      ? left - right : collator.compare(String(left), String(right));
    return (direction === "asc" ? compared : -compared) || collator.compare(identity(a), identity(b));
  });
}
