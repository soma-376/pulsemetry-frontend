"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { Modal } from "@/components/ui/Modal";
import { createCommands, ManagementError, managementKey } from "@/lib/api/management";
import { executeReclaim, METHOD_TEXT, previewReclaim, seatReasonText } from "@/lib/api/seats";
import { int, usd } from "@/lib/format";
import { SeatOperationPanel } from "./SeatOperationPanel";

export type ReclaimTarget = { seatAssignmentId: string; version: number; label: string };

const time = (value: string) => new Date(value).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" });

/**
 * 좌석 회수 확인 (enrollment 명세 §12 "좌석 회수·복원"). 열면 서버가 좌석을 다시 검사한 미리보기를 보여 주고, 확정하면 작업을 만든다.
 * 실행 방식(벤더 API·관리자 조치)과 절감 추정의 근거를 그대로 보여 준다. 실행 뒤에는 작업 상태 — 접수를 성공으로 보이지 않는다.
 * 사용 기록이 없다는 것만으로 회수를 권하지 않는다 — 회수는 관리자의 결정이다.
 */
export function ReclaimModal({ organizationId, target, open, onClose }: { organizationId: string; target: ReclaimTarget | null; open: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const [post] = useState(createCommands);
  const [operationId, setOperationId] = useState<string | null>(null);
  const preview = useMutation({ mutationFn: (seat: ReclaimTarget) => previewReclaim(post, organizationId, [{ seatAssignmentId: seat.seatAssignmentId, expectedVersion: seat.version }]) });
  const execute = useMutation({
    mutationFn: (previewId: string) => executeReclaim(post, organizationId, previewId),
    onSuccess: (operation) => {
      setOperationId(operation.operationId);
      for (const name of ["member-seats", "vendor-seats", "members", "seat-reclaim-candidates"]) void client.invalidateQueries({ queryKey: managementKey(organizationId, name) });
    },
  });
  const { mutate: check, reset: resetPreview } = preview;
  const { reset: resetExecute } = execute;
  // 대상이 바뀌면 부모가 key 로 새로 만든다 — 열릴 때 한 번 서버에 다시 확인한다.
  useEffect(() => { if (open && target) check(target); }, [open, target, check]);

  const close = () => { if (!execute.isPending) { resetPreview(); onClose(); } };
  const data = preview.data;
  const eligible = data?.eligibleSeatAssignmentIds.includes(target?.seatAssignmentId ?? "") ?? false;
  const rejected = data?.rejected.find((item) => item.seatAssignmentId === target?.seatAssignmentId);
  const method = data?.targets?.find((item) => item.seatAssignmentId === target?.seatAssignmentId)?.method;
  // 확인한 뒤 좌석이 바뀌었거나 기한이 지나면 다시 확인해야 한다.
  const stale = execute.error instanceof ManagementError && ["preview_stale", "preview_expired"].includes(execute.error.code);
  return <Modal open={open && !!target} onClose={close} title="좌석 회수 확인" subtitle={target?.label} width={520}
    footer={<>
      <div className="flex-1" />
      <Button onClick={close} disabled={execute.isPending}>{operationId ? "닫기" : "취소"}</Button>
      {!operationId && <Button variant="danger" loading={execute.isPending} loadingLabel="요청 중…" disabled={!eligible || preview.isPending || stale}
        onClick={() => { if (data) execute.mutate(data.previewId); }}>회수 실행</Button>}
    </>}>
    <div className="flex flex-col gap-3 text-xs">
      {preview.isPending && <LoadingState variant="inline" message="서버가 좌석을 다시 확인하는 중입니다…" />}
      {preview.error && <ErrorState message={preview.error.message} retrying={preview.isPending} onRetry={() => { if (target) check(target); }} />}
      {data && !operationId && <>
        {eligible ? <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-sub p-3">
          <div className="col-span-2"><dt className="mb-1 text-[11px] text-text3">실행 방식</dt><dd>{method ? METHOD_TEXT[method] : "-"}</dd></div>
          <div><dt className="mb-1 text-[11px] text-text3">월 절감 추정</dt><dd className="tnum">{data.estimatedMonthlySavingsUsd === null ? "-" : usd(Number(data.estimatedMonthlySavingsUsd))}</dd></div>
          <div><dt className="mb-1 text-[11px] text-text3">회수 뒤 미배정 좌석</dt><dd className="tnum">{data.resultingUnallocatedSeats === null ? "-" : `${int(data.resultingUnallocatedSeats)}석`}</dd></div>
          <p className="col-span-2 text-[11px] leading-5 text-text3">
            {data.estimatedMonthlySavingsUsd === null ? "계약 등급의 단가를 몰라 절감액을 추정하지 않습니다. " : "계약 등급의 좌석 단가로 낸 추정입니다 — 계약 수량을 줄여야 실현되며 그 시점은 모릅니다. "}
            확인은 {time(data.expiresAt)}까지 유효합니다.
          </p>
        </dl> : <ErrorState message={`이 좌석은 회수할 수 없습니다 — ${seatReasonText(rejected?.reason)}`} />}
        {method === "admin_action" && <p className="leading-5 text-text2">이 제품은 벤더 API로 해지하지 않습니다. 실행하면 작업이 관리자 조치 대기로 남고, 벤더 콘솔에서 해지한 뒤 확인해야 좌석이 해제됩니다.</p>}
        {method === "vendor_control" && <p className="leading-5 text-text2">서버가 벤더 API를 부릅니다. 벤더가 받아들인 뒤에야 좌석이 해제(또는 해제 예정)됩니다.</p>}
      </>}
      {execute.error && <ErrorState message={execute.error.message} retrying={preview.isPending}
        onRetry={stale && target ? () => { resetExecute(); check(target); } : undefined} />}
      {operationId && target && <SeatOperationPanel organizationId={organizationId} operationId={operationId} editable
        labels={new Map([[target.seatAssignmentId, target.label]])} onOperation={setOperationId} />}
    </div>
  </Modal>;
}
