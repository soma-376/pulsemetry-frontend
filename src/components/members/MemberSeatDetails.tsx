"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MemberStatusBadge } from "./MemberStatusBadges";
import { ReclaimModal, type ReclaimTarget } from "./ReclaimModal";
import { SeatOperationPanel } from "./SeatOperationPanel";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import {
  memberSeatsOptions,
  METHOD_TEXT,
  SEAT_SOURCE_TEXT,
  SEAT_STATE_TEXT,
  seatReasonText,
  type MemberSeat,
} from "@/lib/api/seats";
import { int } from "@/lib/format";

const time = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : "-";
const label = (seat: MemberSeat) => `${seat.vendorName} · ${seat.account}`;

/**
 * 구성원의 벤더 좌석(`GET O/members/{memberId}/seats`) — 서버 원장의 값과 판정을 그대로 보여 준다.
 * 원장 가용성은 제품 단위다(동기화 낡음·기록 없음 등). 회수 후보인가와 회수할 수 있는가는 따로 말한다.
 * 좌석의 가장 최근 회수·복원 작업은 새로고침 뒤에도 다시 찾아 상태·관리자 조치 확인·복원을 보여 준다.
 */
export function MemberSeatDetails({
  organizationId,
  memberId,
  editable,
}: {
  organizationId: string;
  memberId: string;
  editable: boolean;
}) {
  const query = useQuery(memberSeatsOptions(organizationId, memberId));
  const [reclaim, setReclaim] = useState<ReclaimTarget | null>(null);
  const [operations, setOperations] = useState<Record<string, string>>({});
  if (!query.data)
    return query.error ? (
      <ErrorState
        message={query.error.message}
        retrying={query.isFetching}
        onRetry={() => void query.refetch({ cancelRefetch: false })}
      />
    ) : (
      <LoadingState variant="inline" message="좌석을 불러오는 중입니다…" />
    );
  const { seats, policy, meta } = query.data;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] leading-5 text-text3">
        {time(meta.asOf)} 기준 · 회수 기준 {int(policy.idleDays)}일
      </p>
      {seats.length ? (
        <ul aria-label="벤더별 좌석 상세" className="flex flex-col gap-3">
          {seats.map((seat) => {
            const operationId =
              operations[seat.seatAssignmentId] ??
              seat.lastControl?.operationId ??
              null;
            return (
              <li
                key={seat.seatAssignmentId}
                data-seat-id={seat.seatAssignmentId}
                className="min-w-0 rounded-lg border border-border p-3"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold">
                    {seat.vendorName}
                  </span>
                  <span className="flex gap-1">
                    <MemberStatusBadge
                      label={SEAT_STATE_TEXT[seat.state]}
                      tone={seat.state === "released" ? "neutral" : "active"}
                    />
                    {seat.reclaimCandidate && (
                      <MemberStatusBadge label="회수 후보" tone="candidate" />
                    )}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                  <div className="col-span-2">
                    <dt className="mb-1 text-[11px] text-text3">벤더 계정</dt>
                    <dd className="break-all">{seat.account}</dd>
                  </div>
                  <div>
                    <dt className="mb-1 text-[11px] text-text3">좌석 유형</dt>
                    <dd>{seat.tierLabel ?? seat.vendorTier ?? "-"}</dd>
                  </div>
                  <div>
                    <dt className="mb-1 text-[11px] text-text3">기록 원천</dt>
                    <dd>{SEAT_SOURCE_TEXT[seat.source] ?? seat.source}</dd>
                  </div>
                  <div>
                    <dt className="mb-1 text-[11px] text-text3">마지막 사용</dt>
                    <dd className="tnum">{time(seat.lastUsedAt)}</dd>
                  </div>
                  <div>
                    <dt className="mb-1 text-[11px] text-text3">미사용</dt>
                    <dd className="tnum">
                      {seat.idleDays === null ? "-" : `${int(seat.idleDays)}일`}
                    </dd>
                  </div>
                  {seat.state === "pending_release" && (
                    <div className="col-span-2">
                      <dt className="mb-1 text-[11px] text-text3">
                        해제 예정일
                      </dt>
                      <dd className="tnum">{seat.releaseEffectiveOn ?? "-"}</dd>
                    </div>
                  )}
                  <div className="col-span-2">
                    <dt className="mb-1 text-[11px] text-text3">검토</dt>
                    <dd>
                      {seat.reclaimCandidate
                        ? `${int(policy.idleDays)}일 이상 사용 미관측 — 회수 전 실제 사용 여부를 확인하세요`
                        : seatReasonText(seat.reviewReason)}
                    </dd>
                  </div>
                  {seat.ledgerAvailability !== "available" && (
                    <div className="col-span-2">
                      <dt className="mb-1 text-[11px] text-text3">좌석 원장</dt>
                      <dd className="text-orange-ink">
                        {seatReasonText(seat.ledgerReason)}
                      </dd>
                    </div>
                  )}
                </dl>
                {seat.state === "assigned" && (
                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                    {seat.canReclaim ? (
                      <>
                        <span className="mr-auto text-[11px] text-text3">
                          {seat.reclaimMethod
                            ? METHOD_TEXT[seat.reclaimMethod]
                            : ""}
                        </span>
                        {editable && (
                          <Button
                            variant="danger"
                            size="sm"
                            aria-label={`${seat.vendorName} ${seat.account} 좌석 회수`}
                            onClick={() =>
                              setReclaim({
                                seatAssignmentId: seat.seatAssignmentId,
                                version: seat.version,
                                label: label(seat),
                              })
                            }
                          >
                            좌석 회수
                          </Button>
                        )}
                      </>
                    ) : (
                      <span className="text-[11px] text-text3">
                        회수할 수 없음 — {seatReasonText(seat.reclaimReason)}
                      </span>
                    )}
                  </div>
                )}
                {operationId && (
                  <div className="mt-3">
                    <SeatOperationPanel
                      organizationId={organizationId}
                      operationId={operationId}
                      editable={editable}
                      labels={new Map([[seat.seatAssignmentId, label(seat)]])}
                      onOperation={(next) =>
                        setOperations((all) => ({
                          ...all,
                          [seat.seatAssignmentId]: next,
                        }))
                      }
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-2 text-xs leading-5 text-text2">
          이 구성원에게 이어진 벤더 좌석이 없습니다.
        </p>
      )}
      <ReclaimModal
        key={reclaim?.seatAssignmentId ?? "none"}
        organizationId={organizationId}
        target={reclaim}
        open={!!reclaim}
        onClose={() => setReclaim(null)}
      />
    </div>
  );
}
