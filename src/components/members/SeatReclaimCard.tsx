"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Widget } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { candidatePagesOptions, seatReasonText } from "@/lib/api/seats";
import type { ReclaimCandidate } from "@/lib/api/members";
import { int } from "@/lib/format";
import { formatKst, type MembersModel } from "@/lib/members-view";

type Row = Pick<ReclaimCandidate, "seatAssignmentId" | "memberId" | "account" | "idleDays" | "canReclaim" | "reason" | "vendorAccount"> & { lastSeen: string };

/** 서버가 준 회수 후보만 보여 준다. 좌석 원장이 없으면 후보를 만들지 않는다. 다음 페이지는 같은 기준 시각의 cursor 로 잇는다. */
export function SeatReclaimCard({ organizationId, model, onReview }: { organizationId: string; model: MembersModel; onReview: (memberId: string) => void }) {
  const { reclaim } = model;
  const start = reclaim.available ? reclaim.nextCursor : null;
  const more = useInfiniteQuery({ ...candidatePagesOptions(organizationId, start), enabled: false });
  const extra: Row[] = more.data?.pages.flatMap((page) => (page.candidates.data?.items ?? []).map((item) => ({ ...item, lastSeen: formatKst(item.lastUsedAt) }))) ?? [];
  const rows: Row[] = reclaim.available ? [...reclaim.rows, ...extra] : [];
  const hasMore = reclaim.available && (more.data ? more.hasNextPage : !!start);
  const loadMore = () => void (more.data ? more.fetchNextPage() : more.refetch());
  return <Widget label="좌석 회수 후보" title="좌석 회수 후보" note={reclaim.available ? `${int(rows.length)}석 표시 · 전체 ${int(reclaim.totalCount)}석 · ${reclaim.policyNote}` : reclaim.note}
    className="col-span-2 @max-[1180px]:col-span-full">
    <div className="flex max-h-80 flex-col overflow-y-auto border-t border-border">
      {!reclaim.available && <p className="py-4 text-xs text-text3">{reclaim.message}. 사용 기록이 없다는 것만으로 회수 후보로 올리지 않습니다.</p>}
      {reclaim.available && reclaim.partial && <p className="py-4 text-xs text-text3">{reclaim.partial}. 판정한 좌석만 후보로 보여 줍니다.</p>}
      {reclaim.available && !reclaim.partial && rows.length === 0 && <p className="py-4 text-xs text-text3">확인된 배정·관측 정보에서 회수 후보가 없습니다.</p>}
      {rows.map((seat) => <div key={seat.seatAssignmentId} className="flex flex-wrap items-center gap-3 border-b border-border py-3">
        <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
          <span className="truncate text-[12.5px] font-medium">{seat.account}</span>
          <span className="text-[11px] text-text3">마지막 사용 {seat.lastSeen} · {seat.idleDays}일 미관측{seat.vendorAccount && seat.vendorAccount !== seat.account ? ` · 벤더 계정 ${seat.vendorAccount}` : ""}</span>
          {!seat.canReclaim && <span className="text-[11px] text-text3">회수할 수 없음 — {seatReasonText(seat.reason)}</span>}
        </div>
        <Button size="sm" aria-label={`${seat.account} 좌석 상세`} onClick={() => onReview(seat.memberId)}>좌석 상세</Button>
      </div>)}
      {more.error && <ErrorState variant="inline" message={more.error.message} retrying={more.isFetching} onRetry={loadMore} />}
      {hasMore && <div className="py-3"><Button size="sm" loading={more.isFetching} loadingLabel="불러오는 중…" onClick={loadMore}>더 보기</Button></div>}
    </div>
  </Widget>;
}
