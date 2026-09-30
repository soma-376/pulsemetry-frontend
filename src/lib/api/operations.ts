import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { apiResponse, managementKey, ManagementError, orgPath } from "./management";
import { retryAfterMs } from "./overview";

/**
 * 명령이 접수한 뒤 요청 밖에서 끝나는 일의 상태(대시보드 명세 "작업 상태 조회"). 202 응답과 `GET /operations/{id}`가 같은 모양이다.
 * 서버가 더한 `awaiting_admin_action`·`action`·`retention`도 받는다 — 모르는 상태를 성공으로 바꾸지 않는다.
 */
export const operationSchema = z.object({
  operationId: z.string(),
  kind: z.enum(["seat_reclaim", "seat_restore", "installation_notification", "retention_cleanup"]),
  status: z.enum(["pending", "running", "awaiting_admin_action", "succeeded", "partially_failed", "failed"]),
  createdAt: z.iso.datetime({ offset: true }),
  completedAt: z.iso.datetime({ offset: true }).nullable(),
  results: z.array(z.object({
    targetId: z.string(),
    status: z.enum(["pending", "awaiting_admin_action", "succeeded", "failed"]),
    reason: z.string().nullable(),
    action: z.string().nullable().optional(),
  })),
  canRestore: z.boolean(),
  restoreUntil: z.string().nullable(),
});
export type Operation = z.infer<typeof operationSchema>;
export type OperationPoll = { operation: Operation; retryAfterMs: number | null };

/** 서버가 `Retry-After`를 실은 동안(`pending`·`running`)만 다시 조회한다. 헤더가 없으면 멈춘다. */
export async function fetchOperation(org: string, operationId: string, signal?: AbortSignal): Promise<OperationPoll> {
  const { data, headers } = await apiResponse("dashboard", orgPath(org, `/operations/${encodeURIComponent(operationId)}`), operationSchema, { signal });
  if (data.operationId !== operationId) throw new ManagementError("invalid_response", 422);
  const header = headers.get("Retry-After");
  return { operation: data, retryAfterMs: header ? Math.max(1000, retryAfterMs(header)) : null };
}

export const operationOptions = (org: string, operationId: string | null) => queryOptions({
  queryKey: [...managementKey(org, "operation"), operationId],
  queryFn: ({ signal }) => {
    if (!operationId) throw new Error("조회할 작업이 없습니다.");
    return fetchOperation(org, operationId, signal);
  },
  enabled: !!org && !!operationId,
  refetchInterval: query => query.state.data?.retryAfterMs ?? false,
  refetchOnWindowFocus: false,
  retry: (count: number, error: Error) => count < 2 && (error instanceof TypeError || (error instanceof ManagementError && (error.status === 429 || error.status >= 500))),
  retryDelay: (attempt: number, error: Error) => Math.max(1000 * 2 ** attempt, error instanceof ManagementError ? error.retryAfter : 0),
});

/** 대상 결과의 실패 분류 코드 중 설치 안내(메일)가 내는 것. 모르는 코드는 코드 그대로 보여 준다. */
const FAILURES: Record<string, string> = {
  recipient_rejected: "수신 주소가 거부됨", message_rejected: "메일이 거부됨", invalid_address: "잘못된 주소",
  recipient_deferred: "수신 서버가 나중에 받겠다고 함", smtp_deferred: "메일 서버 일시 거부", smtp_auth_failed: "메일 서버 인증 실패",
  smtp_unavailable: "메일 서버 연결 실패", send_error: "발송 오류", outcome_unknown: "발송 결과를 확인하지 못함", cancelled: "발송 취소",
};
export const failureText = (reason: string | null) => reason ? FAILURES[reason] ?? reason : "사유 없음";
