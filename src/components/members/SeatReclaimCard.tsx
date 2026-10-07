"use client";

import { Button } from "@/components/ui/Button";
import { Widget } from "@/components/ui/Card";
import type { MembersModel } from "@/lib/metrics/members";
import { formatSeatActivity, type MemberSeatRow } from "@/lib/metrics/member-seats";

export function SeatReclaimCard({ model, onReview }: { model: MembersModel; onReview: (seat: MemberSeatRow) => void }) {
  return <Widget label="좌석 회수 후보" title="좌석 회수 후보" note={model.reclaimNote} className="col-span-2 @max-[1180px]:col-span-full">
    <div className="flex max-h-80 flex-col overflow-y-auto border-t border-border">
      {model.reclaimRows.length === 0 && <p className="py-4 text-xs text-text3">확인된 배정·관측 정보에서 회수 후보가 없습니다. 정보가 부족한 좌석은 판단을 보류합니다.</p>}
      {model.reclaimRows.map((seat) => <div key={seat.id} className="flex flex-wrap items-center gap-3 border-b border-border py-3">
        <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
          <span className="truncate text-[12.5px] font-medium">{seat.account}</span>
          <span className="text-xs text-text2">{seat.vendor} · {seat.tier}</span>
          <span className="text-[11px] text-text3">마지막 활동 {formatSeatActivity(seat.lastObservedAt)}</span>
        </div>
        <Button size="sm" aria-label={`${seat.account} ${seat.vendor} ${seat.tier} 좌석 상세`} onClick={() => onReview(seat)}>좌석 상세</Button>
      </div>)}
    </div>
    <p className="mt-3 text-[11px] leading-5 text-text3">{model.seatSnapshotDate.replaceAll("-", ".")} 기준 · 데모 배정 내역 · 실제 회수와 절감액은 벤더 확인이 필요합니다.</p>
  </Widget>;
}
