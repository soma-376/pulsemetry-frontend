import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { int } from "@/lib/format";
import { apiJson, managementKey, ManagementError, orgPath, readOptions } from "./management";

const count = z.number().int().nonnegative().nullable();
export const ingestStatusSchema = z.object({
  organizationId: z.string(),
  status: z.enum(["healthy", "delayed", "down", "empty", "unknown"]),
  reason: z.string().nullable(),
  asOf: z.iso.datetime({ offset: true }),
  lastReceivedAt: z.iso.datetime({ offset: true }).nullable(),
  // 서버가 더한 필드다. 이전 서버는 싣지 않으므로 없으면 표시하지 않는다.
  windowMinutes: z.number().int().positive().optional(),
  activeInstallations: count.optional(),
  observedMembers: count.optional(),
  eligibleMembers: count.optional(),
  coverageRatio: z.number().min(0).max(1).nullable().optional(),
});
export type IngestStatus = z.infer<typeof ingestStatusSchema>;

export const INGEST_STATES = {
  healthy: { label: "수집 정상", color: "var(--green)" },
  delayed: { label: "수집 지연", color: "var(--orange-ink)" },
  down: { label: "수집 중단", color: "var(--red)" },
  empty: { label: "수신 대기", color: "var(--text3)" },
  unknown: { label: "수집 상태 확인 불가", color: "var(--text3)" },
} as const;

/** 서버 판정의 사유 코드(대시보드 명세 "공통 헤더 수집 현황"). 모르는 코드는 코드 그대로 보여 준다. */
const REASONS: Record<string, string> = {
  delivery_stalled: "수집 중인 모든 기기의 전달이 멈췄습니다",
  delivery_delayed: "일부 기기의 전달이 늦어지고 있습니다",
  installations_silent: "수집 기기의 보고가 끊겼습니다",
  source_not_available: "수집 기기의 보고가 없어 판정할 수 없습니다",
};

const time = (value: string) => new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

/** 헤더에 싣는 설명. 서버가 null로 준 값은 싣지 않는다 — 0이나 정상으로 바꾸지 않는다. */
export function ingestDetails(data: IngestStatus): string[] {
  const details: string[] = [];
  if (data.reason) details.push(REASONS[data.reason] ?? `사유 ${data.reason}`);
  if (data.lastReceivedAt) details.push(`마지막 수신 ${time(data.lastReceivedAt)}`);
  else if (data.status === "empty") details.push("아직 수집된 데이터가 없습니다");
  if (data.activeInstallations != null) {
    details.push(`보고 중인 설치 ${int(data.activeInstallations)}대${data.windowMinutes ? `(최근 ${int(data.windowMinutes)}분)` : ""}`);
  }
  return details;
}

export async function fetchIngestStatus(organizationId: string, signal?: AbortSignal) {
  const result = await apiJson("dashboard", orgPath(organizationId, "/ingest-status"), ingestStatusSchema, { signal });
  if (result.organizationId !== organizationId) throw new ManagementError("invalid_response", 422);
  return result;
}

export const ingestStatusOptions = (organizationId: string) => queryOptions({
  queryKey: managementKey(organizationId, "ingest-status"),
  queryFn: ({ signal }) => fetchIngestStatus(organizationId, signal),
  enabled: !!organizationId,
  ...readOptions,
});
