"use client";

import { Button } from "@/components/ui/Button";
import { Widget } from "@/components/ui/Card";
import type { MembersModel } from "@/lib/members-view";

/** 서버가 준 회수 후보만 보여 준다. 좌석 원장이 없으면 후보를 만들지 않는다. */
export function SeatReclaimCard({ model, onReview }: { model: MembersModel; onReview: (memberId: string) => void }) {
  const { reclaim } = model;
  return <Widget label="좌석 회수 후보" title="좌석 회수 후보" note={reclaim.note} className="col-span-2 @max-[1180px]:col-span-full">
    <div className="flex max-h-80 flex-col overflow-y-auto border-t border-border">
      {!reclaim.available && <p className="py-4 text-xs text-text3">{reclaim.message}. 사용 기록이 없다는 것만으로 회수 후보로 올리지 않습니다.</p>}
      {reclaim.available && reclaim.partial && <p className="py-4 text-xs text-text3">{reclaim.partial}. 판정한 좌석만 후보로 보여 줍니다.</p>}
      {reclaim.available && !reclaim.partial && reclaim.rows.length === 0 && <p className="py-4 text-xs text-text3">확인된 배정·관측 정보에서 회수 후보가 없습니다.</p>}
      {reclaim.available && reclaim.rows.map((seat) => <div key={seat.seatAssignmentId} className="flex flex-wrap items-center gap-3 border-b border-border py-3">
        <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
          <span className="truncate text-[12.5px] font-medium">{seat.account}</span>
          <span className="text-[11px] text-text3">마지막 사용 {seat.lastSeen} · {seat.idleDays}일 미관측</span>
        </div>
        <Button size="sm" aria-label={`${seat.account} 좌석 상세`} onClick={() => onReview(seat.memberId)}>좌석 상세</Button>
      </div>)}
    </div>
  </Widget>;
}
