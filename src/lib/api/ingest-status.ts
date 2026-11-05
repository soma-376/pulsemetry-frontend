import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import {
  apiJson,
  managementKey,
  ManagementError,
  orgPath,
  readOptions,
} from "./management";

const count = z.number().int().nonnegative().nullable();
const instant = z.iso.datetime({ offset: true });
export const transmissionLossSchema = z
  .object({
    payloadCount: count,
    windowStart: instant,
    windowEnd: instant,
    availableFrom: instant.nullable(),
    availability: z.enum(["complete", "partial", "unavailable"]),
    reasons: z.array(z.string()),
    affectedInstallationCount: count,
  })
  .refine(
    (value) =>
      value.availability === "unavailable"
        ? value.payloadCount === null &&
          value.affectedInstallationCount === null
        : value.payloadCount !== null &&
          value.affectedInstallationCount !== null,
    { message: "손실 집계 가용성과 수량이 일치해야 합니다" },
  );
export type TransmissionLoss = z.infer<typeof transmissionLossSchema>;
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
  // 먼저 배포한 화면은 구버전 서버의 누락을 확인된 0으로 바꾸지 않는다.
  transmissionLoss: transmissionLossSchema.optional(),
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
  installations_silent: "보고 상태 미확인",
  source_not_available: "수집 기기의 보고가 없어 판정할 수 없습니다",
  source_query_failed: "현재 전송 상태를 조회하지 못했습니다",
};

const LOSS_REASONS: Record<string, string> = {
  tracking_not_started: "손실 집계가 아직 시작되지 않았습니다",
  history_incomplete: "최근 7일 중 일부 기간부터 집계했습니다",
  tracking_interrupted: "손실 추적이 중단된 기간이 있습니다",
  counter_decreased: "같은 실행의 손실 누계가 감소한 보고가 있습니다",
  no_observation: "전송 손실을 관측할 수 있는 설치 보고가 없습니다",
  source_not_available: "손실 집계 근거를 확인할 수 없습니다",
  query_failed: "손실 원장을 조회하지 못했습니다",
};
export const transmissionLossReasonText = (reason: string) =>
  LOSS_REASONS[reason] ?? reason;

export function transmissionLossLabel(loss: TransmissionLoss | undefined) {
  if (!loss) return "집계 정보 없음";
  if (loss.availability === "unavailable")
    return "최근 7일 전송 손실 집계 불가";
  return `최근 7일 전송 손실 ${loss.payloadCount!.toLocaleString("ko-KR")}건${loss.availability === "partial" ? " · 일부 집계" : ""}`;
}

const time = (value: string) =>
  new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

/** 헤더에 싣는 설명. 서버가 null로 준 값은 싣지 않는다 — 0이나 정상으로 바꾸지 않는다. */
export function ingestDetails(data: IngestStatus, compact = false): string[] {
  const details: string[] = [];
  if (
    data.reason &&
    !(
      compact &&
      data.status === "down" &&
      data.reason === "installations_silent"
    )
  )
    details.push(REASONS[data.reason] ?? `사유 ${data.reason}`);
  if (data.lastReceivedAt) {
    const received = new Date(data.lastReceivedAt);
    const date = received.toLocaleDateString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const clock = received.toLocaleTimeString("ko-KR", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    details.push(
      `마지막 수신 ${compact ? `${date} ${clock}` : time(data.lastReceivedAt)}`,
    );
  } else if (data.status === "empty")
    details.push("아직 수집된 데이터가 없습니다");
  return details;
}

export async function fetchIngestStatus(
  organizationId: string,
  signal?: AbortSignal,
) {
  const result = await apiJson(
    "dashboard",
    orgPath(organizationId, "/ingest-status"),
    ingestStatusSchema,
    { signal },
  );
  if (result.organizationId !== organizationId)
    throw new ManagementError("invalid_response", 422);
  return result;
}

export const ingestStatusOptions = (organizationId: string) =>
  queryOptions({
    queryKey: managementKey(organizationId, "ingest-status"),
    queryFn: ({ signal }) => fetchIngestStatus(organizationId, signal),
    enabled: !!organizationId,
    ...readOptions,
  });

export const lossInstallationsSchema = z.object({
  meta: z.object({
    organizationId: z.string(),
    snapshotId: z.string(),
    asOf: instant,
  }),
  windowStart: instant,
  windowEnd: instant,
  installations: z.object({
    items: z.array(
      z.object({
        installationId: z.string(),
        deviceName: z.string().nullable(),
        memberId: z.string().nullable(),
        account: z.string().nullable(),
        payloadCount: z.number().int().positive(),
        lastObservedAt: instant,
        status: z.enum(["active", "revoked"]),
      }),
    ),
    totalCount: z.number().int().nonnegative(),
    nextCursor: z.string().nullable(),
  }),
});
type LossPageParam = { cursor: string; snapshotId: string } | null;

/** 헤더의 서버 집계 기준 시각을 고정한다. 분석 날짜·팀·벤더는 전달하지 않는다. */
export async function fetchLossInstallations(
  organizationId: string,
  windowEnd: string,
  page: LossPageParam,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ windowEnd, limit: "20" });
  if (page) {
    query.set("cursor", page.cursor);
    query.set("snapshotId", page.snapshotId);
  }
  const result = await apiJson(
    "dashboard",
    orgPath(organizationId, `/ingest-status/loss-installations?${query}`),
    lossInstallationsSchema,
    { signal },
  );
  if (
    result.meta.organizationId !== organizationId ||
    Date.parse(result.windowEnd) !== Date.parse(windowEnd) ||
    (page &&
      (result.meta.snapshotId !== page.snapshotId ||
        result.installations.nextCursor === page.cursor))
  )
    throw new ManagementError("invalid_response", 422);
  return result;
}

export const lossInstallationsOptions = (
  organizationId: string,
  windowEnd: string,
) =>
  infiniteQueryOptions({
    queryKey: [
      ...managementKey(organizationId, "loss-installations"),
      windowEnd,
    ],
    queryFn: ({ pageParam, signal }) =>
      fetchLossInstallations(organizationId, windowEnd, pageParam, signal),
    initialPageParam: null as LossPageParam,
    getNextPageParam: (last): LossPageParam =>
      last.installations.nextCursor
        ? {
            cursor: last.installations.nextCursor,
            snapshotId: last.meta.snapshotId,
          }
        : null,
    enabled: !!organizationId && !!windowEnd,
    ...readOptions,
  });
