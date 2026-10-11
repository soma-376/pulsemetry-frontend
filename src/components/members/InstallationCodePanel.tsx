"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { InviteCode } from "./InviteCode";
import {
  installationCodesOptions,
  issueInstallationCode,
} from "@/lib/api/invitations";
import { ManagementError, type createCommands } from "@/lib/api/management";
import { organizationKey } from "@/lib/api/query-keys";
import { deliveryView, formatKst } from "@/lib/members-view";

/**
 * 활성 구성원의 설치 코드 발급(서버 ADR 0055) — 새 PC 등에 CLI 를 다시 설치할 때 쓴다.
 * 코드는 가입에 쓸 수 없고 설치에 한 번 쓴다. 이전에 발급한 설치 코드는 서버가 폐기한다.
 * 발급은 발송이 아니다 — 메일 상태는 서버의 초대 목록 값으로 따로 보여 주고, 발송이 끝날 때까지 다시 읽는다.
 * 코드 원문은 발급 응답에만 있어 지금 화면에만 둔다. 새로고침 뒤에는 발급·만료 시각과 발송 상태만 남는다.
 */
export function InstallationCodePanel({
  organizationId,
  post,
  memberId,
  account,
  version,
}: {
  organizationId: string;
  post: ReturnType<typeof createCommands>;
  memberId: string;
  account: string;
  /** 상세를 연 시점의 구성원 version — 서버가 다르면 409 로 거절한다 */
  version: number;
}) {
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const codes = useQuery(installationCodesOptions(organizationId, memberId));
  const issue = useMutation({
    retry: false,
    mutationFn: () =>
      issueInstallationCode(post, organizationId, memberId, version),
    onSuccess: async () => {
      setConfirming(false);
      await client.invalidateQueries({
        queryKey: installationCodesOptions(organizationId, memberId).queryKey,
      });
    },
    // 구성원이 바뀌었거나(버전·상태) 없어졌으면 목록을 다시 읽는다.
    onError: (failure) => {
      setConfirming(false);
      if (
        failure instanceof ManagementError &&
        [404, 409].includes(failure.status)
      )
        void client.invalidateQueries({
          queryKey: organizationKey(organizationId),
        });
    },
  });
  const issued = issue.data;
  const latest = codes.data?.at(-1) ?? null;
  // 방금 낸 코드의 발송 상태는 목록의 값이 있으면 그것, 아직 다시 읽기 전이면 발급 응답의 값이다.
  const delivery = latest
    ? deliveryView(latest.delivery)
    : issued
      ? deliveryView(issued.delivery)
      : null;
  return (
    <div>
      <div
        role="status"
        aria-label={`${account} 쓰지 않은 설치 코드`}
        className="mb-3 text-xs"
      >
        {codes.isPending ? (
          <span className="text-text3">설치 코드를 확인하는 중입니다…</span>
        ) : latest && delivery ? (
          <span className="flex flex-wrap gap-x-2">
            <span>
              {formatKst(latest.createdAt)} 발급 · {formatKst(latest.expiresAt)}{" "}
              만료{latest.status === "expired" ? " (만료됨)" : ""}
            </span>
            <span
              aria-label={`${account} 설치 코드 메일 발송 상태`}
              className="tnum"
              style={{ color: delivery.color }}
            >
              {delivery.label}
              {delivery.detail && ` · ${delivery.detail}`}
            </span>
          </span>
        ) : (
          <span className="text-text3">쓰지 않은 설치 코드가 없습니다.</span>
        )}
      </div>
      {codes.error && (
        <ErrorState
          variant="inline"
          className="mb-3"
          message={codes.error.message}
          retrying={codes.isFetching}
          onRetry={() => void codes.refetch()}
        />
      )}
      {!confirming && (
        <Button
          size="sm"
          disabled={issue.isPending}
          aria-label={`${account} 설치 코드 발급`}
          onClick={() => setConfirming(true)}
        >
          {latest || issued ? "새 설치 코드 발급" : "설치 코드 발급"}
        </Button>
      )}
      {confirming && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-sub px-3 py-2.5"
        >
          <span className="flex-1 text-[11.5px]">
            {account}에게 설치 전용 코드를 새로 발급합니다. 메일 발송이 켜져
            있으면 설치 방법을 메일로 보냅니다. 이전에 발급한 설치 코드는 더
            이상 쓸 수 없습니다.
          </span>
          <Button
            size="sm"
            disabled={issue.isPending}
            onClick={() => setConfirming(false)}
          >
            되돌리기
          </Button>
          <Button
            size="sm"
            variant="primary"
            loading={issue.isPending}
            loadingLabel="발급 중…"
            disabled={issue.isPending}
            onClick={() => issue.mutate()}
          >
            발급 확인
          </Button>
        </div>
      )}
      {issued && (
        <div
          role="status"
          aria-label={`${account} 설치 코드 발급 결과`}
          className="mt-3 flex flex-col gap-2 rounded-md bg-sub px-3 py-2.5 text-[11.5px] text-text2"
        >
          <span>
            설치 코드를 발급했습니다 · {formatKst(issued.expiresAt)} 만료.
            {issued.replacesInvitationIds.length > 0 &&
              ` 이전 설치 코드 ${issued.replacesInvitationIds.length}개는 더 이상 쓸 수 없습니다.`}
          </span>
          <span>
            {deliveryView(issued.delivery).mailed
              ? "메일에는 설치 방법만 있습니다 — 계정 만들기 링크는 없습니다. 발송 결과는 위에 표시됩니다."
              : "메일을 발송하지 않습니다. 코드는 지금만 볼 수 있으니 대상자에게 직접 전달하세요."}
          </span>
          <InviteCode email={account} code={issued.code} label="설치 코드" />
        </div>
      )}
      {issue.error && (
        <ErrorState
          variant="panel"
          className="mt-3"
          message={issue.error.message}
        />
      )}
    </div>
  );
}
