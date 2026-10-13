import { EmptyState } from "./EmptyState";

/** 기간 조회가 성공했지만 결과가 없는 경우의 공통 표현. */
export function PeriodEmptyState({
  scope = "page",
}: {
  scope?: "page" | "team";
}) {
  return (
    <EmptyState
      message="선택한 기간에 데이터가 없습니다"
      description={
        scope === "team"
          ? "다른 팀이나 기간을 선택해 주세요."
          : "다른 기간을 선택해 주세요."
      }
      className="min-h-[240px] w-full"
    />
  );
}
