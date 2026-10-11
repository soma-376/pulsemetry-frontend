"use client";

import { useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  createCommands,
  ManagementError,
  managementKey,
} from "@/lib/api/management";
import {
  installationsOptions,
  NOTIFY_LIMIT,
  notifyInstallations,
  type Installation,
  type PolicyStatus,
} from "@/lib/api/installations";
import {
  failureText,
  operationOptions,
  type Operation,
  type OperationPoll,
} from "@/lib/api/operations";
import { int } from "@/lib/format";
import {
  EVIDENCE_LABEL,
  evidenceTime,
  rolloutEvidenceText,
  type RolloutEvidence,
} from "@/lib/policy-rollout";

export type Rollout = {
  desiredVersion: number;
  eligibleInstallations: number;
  appliedInstallations: number;
  outdatedInstallations: number;
  unknownInstallations: number;
  evidence?: RolloutEvidence;
};
const time = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : "-";
const TARGET_STATUS = {
  pending: "발송 대기",
  awaiting_admin_action: "조치 대기",
  succeeded: "발송됨",
  failed: "발송 실패",
} as const;
const OPERATION_STATUS: Record<Operation["status"], string> = {
  pending: "접수됨",
  running: "메일 발송 중",
  awaiting_admin_action: "조치 대기",
  succeeded: "모두 발송됨",
  partially_failed: "일부 발송 실패",
  failed: "발송 실패",
};

/**
 * 정책 적용 현황의 설치 목록과 업데이트 확인 알림(대시보드 명세 "정책 적용 현황과 업데이트 안내").
 * 알림은 설치를 쓰는 구성원에게 가는 확인 요청 메일이다. 결과는 메일 발송 결과이며 설치의 적용과 다르다 — 적용은 목록으로 다시 확인한다.
 */
export function InstallationsModal({
  organizationId,
  rollout,
  channel,
  open,
  onClose,
}: {
  organizationId: string;
  rollout: Rollout;
  channel: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const initial: PolicyStatus =
    rollout.outdatedInstallations > 0
      ? "outdated"
      : rollout.unknownInstallations > 0
        ? "unknown"
        : "applied";
  const [status, setStatus] = useState<PolicyStatus>(initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [operationId, setOperationId] = useState<string | null>(null);
  const [post] = useState(createCommands);
  const list = useInfiniteQuery({
    ...installationsOptions(organizationId, status),
    enabled: open,
  });
  const rows =
    list.data?.pages.flatMap((page) => page.installations.items) ?? [];
  const byId = new Map(rows.map((row) => [row.installationId, row]));
  const total = list.data?.pages[0]?.installations.totalCount;
  const operation = useQuery({
    ...operationOptions(organizationId, operationId),
    enabled: open && !!operationId,
  });
  const notify = useMutation({
    retry: false,
    mutationFn: (ids: string[]) =>
      notifyInstallations(post, organizationId, ids, rollout.desiredVersion),
    onSuccess: (result) => {
      setOperationId(result.operationId);
      setSelected(new Set());
    },
    onError: (error) => {
      // 판이 바뀌었거나 이미 적용한 설치가 섞였다 — 최신 현황을 다시 읽는다.
      if (error instanceof ManagementError && error.status === 409) {
        void client.invalidateQueries({
          queryKey: managementKey(organizationId, "settings"),
        });
        void client.invalidateQueries({
          queryKey: managementKey(organizationId, "installations"),
        });
      }
    },
  });
  const snapshotExpired =
    list.error instanceof ManagementError &&
    list.error.code === "snapshot_expired";
  const running = operation.data
    ? operation.data.retryAfterMs !== null
    : !!operationId;
  const notifiable = rows.filter((row) => row.canNotify);
  const toggle = (row: Installation) =>
    setSelected((value) => {
      const next = new Set(value);
      if (next.has(row.installationId)) next.delete(row.installationId);
      else if (next.size < NOTIFY_LIMIT) next.add(row.installationId);
      return next;
    });
  const choose = (value: PolicyStatus) => {
    setStatus(value);
    setSelected(new Set());
  };
  const close = () => {
    if (!notify.isPending) {
      notify.reset();
      onClose();
    }
  };
  const counts: Record<PolicyStatus, number> = {
    outdated: rollout.outdatedInstallations,
    unknown: rollout.unknownInstallations,
    applied: rollout.appliedInstallations,
  };
  const sendDisabledReason = !channel
    ? "메일 발송이 설정되지 않아 알림을 보낼 수 없습니다"
    : running
      ? "보낸 알림의 발송이 끝난 뒤에 다시 보낼 수 있습니다"
      : !selected.size
        ? "알림을 보낼 설치를 선택하세요"
        : undefined;
  return (
    <Modal
      open={open}
      onClose={close}
      title="수집 정책 적용 현황"
      subtitle={`수집 정책 v${rollout.desiredVersion} · 적용 ${int(rollout.appliedInstallations)} / ${int(rollout.eligibleInstallations)}대`}
      width={760}
      footer={
        <>
          <span className="text-xs text-text3">
            {selected.size
              ? `${int(selected.size)}대 선택`
              : channel
                ? "알림은 설치를 쓰는 구성원에게 가는 확인 요청 메일입니다"
                : "메일 발송이 설정되지 않은 서버입니다"}
          </span>
          <div className="flex-1" />
          <Button onClick={close} disabled={notify.isPending}>
            닫기
          </Button>
          <Button
            variant="primary"
            loading={notify.isPending}
            loadingLabel="요청 중…"
            disabled={!!sendDisabledReason}
            title={sendDisabledReason}
            onClick={() => notify.mutate([...selected])}
          >
            업데이트 확인 알림 보내기
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <SegmentedControl<PolicyStatus>
          label="적용 상태"
          value={status}
          onChange={choose}
          options={[
            { value: "outdated", label: `미적용 ${int(counts.outdated)}` },
            { value: "unknown", label: `확인 불가 ${int(counts.unknown)}` },
            { value: "applied", label: `적용 ${int(counts.applied)}` },
          ]}
        />
        <p className="text-xs text-text2">
          {rolloutEvidenceText(rollout.evidence)}
        </p>
        <p className="text-xs text-text2">
          {status === "outdated"
            ? "지금 판이 이전 판인 설치입니다."
            : status === "unknown"
              ? "지금 판을 확인할 근거가 없는 설치입니다. 적용 완료나 미적용으로 추정하지 않습니다."
              : "지금 판이 현재 판인 설치입니다."}{" "}
          근거가 적용 확인 기록인 설치는 그 판을 적용한 적이 있다는 기록이며,
          지금도 그 판으로 수집한다는 최근 보고가 아닙니다. 알림은 원격으로
          업데이트하지 않습니다. 지금의 데몬은 새 정책을 스스로 받지 않으므로
          알림은 사용자에게 다시 설치를 안내합니다.
        </p>
        {notify.error && <ErrorState message={notify.error.message} />}
        {operationId && <OperationResult query={operation} rows={byId} />}
        {!list.data && list.isPending && (
          <LoadingState message="설치 목록을 불러오는 중입니다…" />
        )}
        {list.error && (
          <ErrorState
            message={list.error.message}
            retrying={list.isFetching}
            onRetry={() =>
              void (snapshotExpired
                ? client.resetQueries({
                    queryKey: installationsOptions(organizationId, status)
                      .queryKey,
                  })
                : list.refetch({ cancelRefetch: false }))
            }
          />
        )}
        {list.data && !rows.length && (
          <EmptyState
            message={
              status === "outdated"
                ? "미적용 설치가 없습니다."
                : status === "unknown"
                  ? "적용 여부를 확인할 수 없는 설치가 없습니다."
                  : "적용한 설치가 없습니다."
            }
          />
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table
              aria-label="설치 목록"
              className="w-full min-w-[640px] border-collapse text-xs"
            >
              <thead>
                <tr className="border-b border-border text-left text-text3">
                  <th scope="col" className="w-8 pb-2 font-medium">
                    {notifiable.length > 0 && (
                      <input
                        type="checkbox"
                        aria-label="알림 보낼 수 있는 설치 모두 선택"
                        disabled={!channel || running}
                        checked={notifiable
                          .slice(0, NOTIFY_LIMIT)
                          .every((row) => selected.has(row.installationId))}
                        onChange={(event) =>
                          setSelected(
                            event.target.checked
                              ? new Set(
                                  notifiable
                                    .slice(0, NOTIFY_LIMIT)
                                    .map((row) => row.installationId),
                                )
                              : new Set(),
                          )
                        }
                      />
                    )}
                  </th>
                  {["설치", "계정", "팀", "적용 판", "근거", "근거 시각"].map(
                    (label) => (
                      <th key={label} scope="col" className="pb-2 font-medium">
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.installationId}
                    className="border-b border-border"
                  >
                    <td className="py-2.5">
                      {row.canNotify && (
                        <input
                          type="checkbox"
                          aria-label={`${row.account ?? row.installationId} 알림 대상`}
                          disabled={!channel || running}
                          checked={selected.has(row.installationId)}
                          onChange={() => toggle(row)}
                        />
                      )}
                    </td>
                    <td className="py-2.5 font-mono" title={row.installationId}>
                      {row.installationId.slice(0, 8)}
                    </td>
                    <td>{row.account ?? "-"}</td>
                    <td>{row.team.teamName ?? "-"}</td>
                    <td className="tnum">
                      {row.appliedPolicyVersion == null
                        ? "확인 불가"
                        : `v${row.appliedPolicyVersion}`}
                    </td>
                    <td>{EVIDENCE_LABEL[row.appliedEvidence]}</td>
                    <td className="tnum">{time(evidenceTime(row))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.hasNextPage && (
          <div className="flex items-center justify-between gap-2 text-xs text-text3">
            <span>
              {int(rows.length)} / {total == null ? "-" : int(total)}대 표시
            </span>
            <Button
              size="sm"
              loading={list.isFetchingNextPage}
              loadingLabel="불러오는 중…"
              onClick={() => void list.fetchNextPage()}
            >
              더보기
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** 작업 상태 조회의 결과. 발송 결과만 말한다 — "보냈습니다"는 서버가 확인한 대상에만 쓴다. */
function OperationResult({
  query,
  rows,
}: {
  query: UseQueryResult<OperationPoll, Error>;
  rows: Map<string, Installation>;
}) {
  const data = query.data?.operation;
  if (!data)
    return query.error ? (
      <ErrorState
        message={query.error.message}
        retrying={query.isFetching}
        onRetry={() => void query.refetch({ cancelRefetch: false })}
      />
    ) : (
      <LoadingState
        variant="inline"
        message="알림 요청을 접수했습니다. 발송 상태를 확인하는 중입니다…"
      />
    );
  const sent = data.results.filter(
    (result) => result.status === "succeeded",
  ).length;
  const failed = data.results.filter(
    (result) => result.status === "failed",
  ).length;
  const waiting = data.results.length - sent - failed;
  return (
    <section
      aria-label="알림 발송 결과"
      className="rounded-lg border border-border bg-sub p-3 text-xs"
    >
      <p role="status" className="font-semibold">
        {OPERATION_STATUS[data.status]} · 발송됨 {int(sent)}대 · 실패{" "}
        {int(failed)}대{waiting ? ` · 대기 ${int(waiting)}대` : ""}
      </p>
      <p className="mt-1 text-text3">
        발송 결과는 메일 서버가 받았는지입니다. 설치의 정책 적용 여부는 목록에서
        다시 확인하세요.
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {data.results.map((result) => {
          const row = rows.get(result.targetId);
          return (
            <li key={result.targetId} className="flex gap-2">
              <span className="font-mono">{result.targetId.slice(0, 8)}</span>
              <span className="text-text2">{row?.account ?? ""}</span>
              <span
                className={
                  result.status === "failed"
                    ? "text-red"
                    : result.status === "succeeded"
                      ? "text-green"
                      : "text-text3"
                }
              >
                {TARGET_STATUS[result.status]}
                {result.status === "failed"
                  ? ` · ${failureText(result.reason)}`
                  : ""}
              </span>
            </li>
          );
        })}
      </ul>
      {query.error && (
        <ErrorState
          variant="inline"
          message="발송 상태를 다시 확인하지 못했습니다."
          retrying={query.isFetching}
          onRetry={() => void query.refetch({ cancelRefetch: false })}
        />
      )}
    </section>
  );
}
