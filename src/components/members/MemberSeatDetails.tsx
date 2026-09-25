import { MemberStatusBadge } from "./MemberStatusBadges";
import { Button } from "@/components/ui/Button";
import { formatSeatActivity, type MemberSeatRow } from "@/lib/metrics/member-seats";

const assignmentLabels = { assigned: "배정됨", unassigned: "배정 해제", unknown: "확인 필요" };

export function MemberSeatDetails({ seats, asOf, highlightedId, unobserved, onReclaim }: { seats: MemberSeatRow[]; asOf: string; highlightedId?: string; unobserved: boolean; onReclaim: (seat: MemberSeatRow) => void }) {
  return <div className="flex flex-col gap-3">
    <p className="text-[11px] leading-5 text-text3">{asOf.replaceAll("-", ".")} 기준</p>
    {unobserved && <p className="rounded-lg bg-sub p-3 text-xs leading-5 text-text2">아직 어떤 벤더에서도 활동이 관측되지 않았습니다.</p>}
    {seats.length ? <ul aria-label="벤더별 좌석 상세" className="flex flex-col gap-3">
      {seats.map((seat) => <li key={seat.id} data-highlighted={seat.id === highlightedId || undefined}
        className={`min-w-0 rounded-lg border p-3 ${seat.id === highlightedId ? "border-blue/50 bg-blue/5" : "border-border"}`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] font-semibold">{seat.vendor}</span>
          <MemberStatusBadge label={seat.reviewLabel} tone={seat.review === "candidate" ? "candidate" : seat.review === "observed" ? "active" : "neutral"} />
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
          <div><dt className="mb-1 text-[11px] text-text3">좌석 유형</dt><dd>{seat.tier ?? "확인 필요"}</dd></div>
          <div><dt className="mb-1 text-[11px] text-text3">배정 상태</dt><dd>{assignmentLabels[seat.assignment]}</dd></div>
          <div className="col-span-2"><dt className="mb-1 text-[11px] text-text3">마지막 활동</dt><dd className="tnum">{formatSeatActivity(seat.lastObservedAt)}</dd></div>
        </dl>
        {seat.review === "candidate" && <div className="mt-3 flex justify-end"><Button variant="danger" className="min-h-9 px-3" onClick={() => onReclaim(seat)} aria-label={`${seat.vendor} ${seat.tier} 좌석 회수`}>{seat.vendor} 좌석 회수</Button></div>}
      </li>)}
    </ul> : <p className="py-2 text-xs leading-5 text-text2">벤더 좌석 배정 정보가 없습니다.</p>}
  </div>;
}
