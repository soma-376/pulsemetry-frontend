/**
 * 커버리지 스트립 — 수치가 "전체"가 아니라 "텔레메트리가 닿은 범위"임을 계속 상기시킵니다.
 * 이 줄이 없으면 83% 표본을 100% 로 읽게 됩니다.
 */
export function CoverageBar({
  dotColor,
  installs,
  members,
  coverage,
  ingestText,
  ingestColor,
  coverageNote,
}: {
  dotColor: string;
  installs: string;
  members: string;
  coverage: string;
  ingestText: string;
  ingestColor: string;
  coverageNote?: string;
}) {
  return (
    <div className="flex h-7 shrink-0 items-center gap-2 overflow-hidden border-b border-border bg-sub px-6 text-[12px] whitespace-nowrap text-text2">
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: dotColor }}
      />
      <span>
        텔레메트리 활성 기기 기준 · 활성 설치{" "}
        <b className="tnum font-semibold text-text">{installs}</b> / 활성 구성원{" "}
        <b className="tnum font-semibold text-text">{members}</b> (
        <b className="font-semibold text-text">{coverage}</b>)
      </span>
      <span
        className="font-semibold whitespace-nowrap"
        style={{ color: ingestColor }}
      >
        · {ingestText}
      </span>
      {coverageNote && (
        <span className="text-[12px] font-semibold whitespace-nowrap text-orange-ink">
          · {coverageNote}
        </span>
      )}
      <a href="#" className="ml-auto text-[12px]">
        커버리지 상세
      </a>
    </div>
  );
}
