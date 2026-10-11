import { infiniteQueryOptions } from "@tanstack/react-query";
import { z } from "zod";
import {
  apiJson,
  managementKey,
  ManagementError,
  orgPath,
  readOptions,
  type createCommands,
} from "./management";
import { operationSchema } from "./operations";

export type PolicyStatus = "applied" | "outdated" | "unknown";
const installationSchema = z.object({
  installationId: z.string(),
  memberId: z.string().nullable(),
  account: z.string().nullable(),
  team: z.object({
    teamId: z.string().nullable(),
    teamName: z.string().nullable(),
  }),
  agentVersion: z.string().nullable(),
  /** 설치가 지금 집행하는 판. 확인되지 않았으면 null — 적용 완료나 미적용으로 추정하지 않는다. */
  appliedPolicyVersion: z.number().int().nullable(),
  /** 마지막 설치 보고를 받은 서버 시각. 보고한 적이 없으면 null. */
  lastHeartbeatAt: z.iso.datetime({ offset: true }).nullable(),
  canNotify: z.boolean(),
  /** 지금 판의 근거(서버 가산): 최근 설치 보고 · 보고가 없어 쓴 적용 확인 기록 · 근거 없음. */
  appliedEvidence: z.enum(["heartbeat", "applied_confirmation", "none"]),
  /** 근거가 적용 확인 기록일 때 그 판을 확인한 시각. 그 밖에는 null. */
  appliedConfirmedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type Installation = z.infer<typeof installationSchema>;
const pageSchema = z.object({
  meta: z.object({ organizationId: z.string(), snapshotId: z.string() }),
  desiredPolicyVersion: z.number().int(),
  installations: z.object({
    items: z.array(installationSchema),
    totalCount: z.number().int().nonnegative(),
    nextCursor: z.string().nullable(),
  }),
});
export type InstallationsPage = z.infer<typeof pageSchema>;
type PageParam = { cursor: string; snapshotId: string } | null;

/** 한 페이지(최대 100대). 다음 페이지는 같은 필터·같은 snapshot으로 읽는다(대시보드 명세 "정책 적용 현황과 업데이트 안내"). */
export async function fetchInstallations(
  org: string,
  status: PolicyStatus,
  page: PageParam,
  signal?: AbortSignal,
): Promise<InstallationsPage> {
  const query = new URLSearchParams({ policyStatus: status, limit: "100" });
  if (page) {
    query.set("cursor", page.cursor);
    query.set("snapshotId", page.snapshotId);
  }
  const data = await apiJson(
    "dashboard",
    orgPath(org, `/installations?${query}`),
    pageSchema,
    { signal },
  );
  if (
    data.meta.organizationId !== org ||
    (page && data.meta.snapshotId !== page.snapshotId)
  )
    throw new ManagementError("invalid_response", 422);
  return data;
}

export const installationsOptions = (org: string, status: PolicyStatus) =>
  infiniteQueryOptions({
    queryKey: [...managementKey(org, "installations"), status],
    queryFn: ({ pageParam, signal }) =>
      fetchInstallations(org, status, pageParam, signal),
    initialPageParam: null as PageParam,
    getNextPageParam: (last): PageParam =>
      last.installations.nextCursor
        ? {
            cursor: last.installations.nextCursor,
            snapshotId: last.meta.snapshotId,
          }
        : null,
    ...readOptions,
  });

/** 서버가 한 번에 받는 안내 대상의 최대 수. */
export const NOTIFY_LIMIT = 100;
/** 안내 요청. 202는 접수일 뿐이다 — 결과는 작업 상태 조회로 본다(대상 결과 = 메일 발송 결과, 설치의 적용과 다르다). */
export function notifyInstallations(
  post: ReturnType<typeof createCommands>,
  org: string,
  installationIds: string[],
  expectedPolicyVersion: number,
) {
  return post(
    org,
    "/installation-update-notifications",
    { installationIds, expectedPolicyVersion },
    operationSchema,
  );
}
