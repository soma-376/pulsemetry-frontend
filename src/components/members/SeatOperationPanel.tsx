"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { createCommands, managementKey } from "@/lib/api/management";
import { operationOptions, type Operation } from "@/lib/api/operations";
import { ACTION_TEXT, cancelAdminAction, confirmAdminAction, restoreReclaim, seatReasonText } from "@/lib/api/seats";
import { int } from "@/lib/format";

const OPERATION_STATUS: Record<Operation["status"], string> = {
  pending: "접수됨", running: "벤더 처리 중", awaiting_admin_action: "관리자 조치 대기", succeeded: "완료", partially_failed: "일부 실패", failed: "실패",
};
const TARGET_STATUS: Record<Operation["results"][number]["status"], string> = {
  pending: "벤더 호출 대기", awaiting_admin_action: "관리자 조치 대기", succeeded: "완료", failed: "실패",
};
const time = (value: string | null) => value ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-";

/**
 * 좌석 회수·복원 작업의 상태(작업 조회). 대상마다 결과를 그대로 보여 준다 — 조치 대기는 완료가 아니다.
 * 관리자 조치 대기 대상에는 벤더 콘솔에서 할 일과 확인·취소를, 되돌릴 수 있는 회수에는 복원을 둔다. [labels] 는 좌석 ID → 표시 이름이다.
 */
export function SeatOperationPanel({ organizationId, operationId, labels, editable, onOperation }: {
  organizationId: string;
  operationId: string;
  labels: Map<string, string>;
  editable: boolean;
  /** 복원처럼 새 작업이 생기면 그 작업으로 바꿔 보여 준다. */
  onOperation: (operationId: string) => void;
}) {
  const client = useQueryClient();
  const [post] = useState(createCommands);
  const query = useQuery(operationOptions(organizationId, operationId));
  const refreshSeats = () => {
    for (const name of ["member-seats", "vendor-seats", "members", "seat-reclaim-candidates", "settings"]) void client.invalidateQueries({ queryKey: managementKey(organizationId, name) });
  };
  const settle = (operation: Operation) => {
    client.setQueryData(operationOptions(organizationId, operation.operationId).queryKey, { operation, retryAfterMs: null });
    void client.invalidateQueries({ queryKey: operationOptions(organizationId, operation.operationId).queryKey });
    refreshSeats();
  };
  const confirm = useMutation({ mutationFn: (seat: string) => confirmAdminAction(post, organizationId, operationId, seat), onSuccess: settle });
  const cancel = useMutation({ mutationFn: (seat: string) => cancelAdminAction(post, organizationId, operationId, seat), onSuccess: settle });
  const restore = useMutation({ mutationFn: () => restoreReclaim(post, organizationId, operationId), onSuccess: (operation) => { settle(operation); onOperation(operation.operationId); } });

  const data = query.data?.operation;
  if (!data) return query.error ? <ErrorState message={query.error.message} retrying={query.isFetching} onRetry={() => void query.refetch({ cancelRefetch: false })} />
    : <LoadingState variant="inline" message="작업 상태를 확인하는 중입니다…" />;
  const restoreKind = data.kind === "seat_restore";
  const done = data.results.filter((result) => result.status === "succeeded").length;
  const failed = data.results.filter((result) => result.status === "failed").length;
  const busy = confirm.isPending || cancel.isPending || restore.isPending;
  return <section aria-label={restoreKind ? "좌석 복원 작업" : "좌석 회수 작업"} className="rounded-lg border border-border bg-sub p-3 text-xs">
    <p role="status" className="font-semibold">{restoreKind ? "복원" : "회수"} · {OPERATION_STATUS[data.status]} · 완료 {int(done)} · 실패 {int(failed)}
      {data.results.length - done - failed ? ` · 남음 ${int(data.results.length - done - failed)}` : ""}</p>
    <p className="mt-1 text-text3">접수 {time(data.createdAt)}{data.completedAt ? ` · 끝남 ${time(data.completedAt)}` : ""}
      {!restoreKind && data.restoreUntil ? ` · 복원 기한 ${time(data.restoreUntil)}` : ""}</p>
    <ul className="mt-2 flex flex-col gap-2">{data.results.map((result) => <li key={result.targetId} className="rounded-md bg-card p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{labels.get(result.targetId) ?? result.targetId.slice(0, 8)}</span>
        <span className={result.status === "failed" ? "text-red" : result.status === "succeeded" ? "text-green" : "text-orange-ink"}>
          {TARGET_STATUS[result.status]}{result.status === "failed" ? ` · ${seatReasonText(result.reason)}` : ""}</span>
      </div>
      {result.status === "awaiting_admin_action" && <div className="mt-2 flex flex-col gap-2">
        <p className="text-text2">{ACTION_TEXT[result.action ?? ""] ?? "벤더 관리 콘솔에서 조치한 뒤 확인하세요."}</p>
        {editable && <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" loading={confirm.isPending && confirm.variables === result.targetId} loadingLabel="확인 중…" disabled={busy}
            onClick={() => confirm.mutate(result.targetId)}>{restoreKind ? "배정 완료 확인" : "해지 완료 확인"}</Button>
          <Button size="sm" loading={cancel.isPending && cancel.variables === result.targetId} loadingLabel="취소 중…" disabled={busy}
            onClick={() => cancel.mutate(result.targetId)}>조치 취소</Button>
        </div>}
      </div>}
    </li>)}</ul>
    {(confirm.error || cancel.error) && <ErrorState variant="inline" message={(confirm.error ?? cancel.error)!.message} />}
    {!restoreKind && data.canRestore && editable && <div className="mt-3 flex items-center gap-2">
      <span className="flex-1 text-text3">회수에서 해지된 좌석을 되돌립니다. 벤더 제어가 없는 좌석은 다시 관리자 조치가 필요합니다.</span>
      <Button size="sm" loading={restore.isPending} loadingLabel="요청 중…" disabled={busy} onClick={() => restore.mutate()}>복원</Button>
    </div>}
    {restore.error && <ErrorState variant="inline" message={restore.error.message} />}
    {query.error && <ErrorState variant="inline" message="작업 상태를 다시 확인하지 못했습니다." retrying={query.isFetching} onRetry={() => void query.refetch({ cancelRefetch: false })} />}
  </section>;
}
