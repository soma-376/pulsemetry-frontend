const FALLBACK_REASON = "비교할 수 있는 수집 근거가 없습니다";

/**
 * 비교 기간 대비 증감을 계산할 수 없을 때 쓰는 유일한 품질 배지.
 * 데이터 품질 배지는 PROJ-319에서 정리했지만, 비교 불가는 증감 자리가 비어 보이는 이유를 알려야 해서 남긴다.
 * 짧은 문구를 항상 표시하고, 사유는 포인터·키보드 초점에서 확인한다.
 * 툴팁은 가장 가까운 `relative` 조상 너비에 맞춰 펼쳐진다.
 */
export function ComparisonUnavailableBadge({ reason }: { reason?: string }) {
  const text = reason || FALLBACK_REASON;
  return (
    <span
      tabIndex={0}
      aria-label={`비교 불가: ${text}`}
      className="group inline-flex shrink-0 cursor-help rounded-[3px] bg-gray-tint px-1.5 py-0.5 text-[10.5px] leading-[14px] font-semibold whitespace-nowrap text-text2 outline-offset-2"
    >
      비교 불가
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-full right-0 left-0 z-20 mt-1 hidden rounded-md border border-border bg-card p-2.5 text-left text-xs leading-5 font-normal whitespace-normal text-text2 shadow-lg group-hover:block group-focus-visible:block"
      >
        {text}
      </span>
    </span>
  );
}
