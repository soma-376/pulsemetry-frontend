import { ButtonLink } from "@/components/ui/Button";

/**
 * 수집 중단 배너.
 * 값이 0으로 내려간 게 아니라 신호가 끊긴 것이라는 구분을 여기서 못 박습니다 —
 * 이 문장이 없으면 좌석 회수 판단이 통째로 뒤집힙니다.
 */
export function IngestDownBanner({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-3 border-b border-red bg-red-tint px-6 py-[11px]"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[12.5px] font-semibold text-red">{title}</span>
        <span className="pretty text-[11.5px] text-text2">{detail}</span>
      </div>
      <ButtonLink href="/settings#collection" variant="primary" className="px-3">
        수집 상태 확인
      </ButtonLink>
    </div>
  );
}
