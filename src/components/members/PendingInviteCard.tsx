"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Widget } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { InviteCode } from "./InviteCode";
import { reissueInvitation, revokeInvitation, type ReissuedInvitation } from "@/lib/api/invitations";
import { ManagementError, type createCommands } from "@/lib/api/management";
import { organizationKey } from "@/lib/api/query-keys";
import { formatKst, type InviteRow, type MembersModel } from "@/lib/members-view";

type Action = { kind: "reissue" | "revoke"; invite: InviteRow };

/**
 * 초대 대기.
 *
 * 좌석 회수 후보와 대칭입니다 — 저쪽이 나갈 사람이면 이쪽은 들어올 사람.
 * 아직 합류하지 않은 사람만 보여 줍니다. 수락 전에는 좌석을 차지하지 않으므로 좌석 지표에 더하지 않습니다.
 *
 * 만료된 초대는 코드가 죽어 있어 기다린다고 들어오지 않습니다 — 다시 발급해야 합니다.
 * 재발급은 코드 발급이지 발송이 아닙니다. 새 코드는 발급 직후에만 볼 수 있습니다.
 */
export function PendingInviteCard({ organizationId, post, model, loading, error, retrying, onRetry, editable, onEdit, onRevoked }: {
  organizationId: string;
  post: ReturnType<typeof createCommands>;
  model: MembersModel;
  loading: boolean;
  error: Error | null;
  retrying: boolean;
  onRetry: () => void;
  /** 초대를 바꿀 수 있는가 */
  editable: boolean;
  onEdit: (invite: InviteRow) => void;
  onRevoked: (message: string) => void;
}) {
  const client = useQueryClient();
  const rows = model.inviteRows;
  // 초대 ID는 재발급하면 바뀐다. 행의 결과는 바뀌지 않는 구성원 ID로 붙인다.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [reissued, setReissued] = useState<Record<string, ReissuedInvitation>>({});
  const refresh = () => client.invalidateQueries({ queryKey: organizationKey(organizationId) });
  const action = useMutation({
    retry: false,
    mutationFn: async ({ kind, invite }: Action) => kind === "reissue"
      ? reissueInvitation(post, organizationId, invite.invitationId)
      : (await revokeInvitation(post, organizationId, invite.invitationId), null),
    onSuccess: async (result, { invite }) => {
      setConfirming(null);
      setReissued((previous) => {
        const next = { ...previous };
        if (result) next[invite.memberId] = result; else delete next[invite.memberId];
        return next;
      });
      await refresh();
      if (!result) onRevoked(`${invite.email}의 초대를 취소했습니다.`);
    },
    // 이미 쓰였거나 취소된 초대면 목록이 낡은 것이다.
    onError: (failure) => { if (failure instanceof ManagementError && [404, 409].includes(failure.status)) void refresh(); },
  });
  const run = (kind: Action["kind"], invite: InviteRow) => { if (!action.isPending) action.mutate({ kind, invite }); };
  const running = (kind: Action["kind"], invite: InviteRow) => action.isPending && action.variables.kind === kind && action.variables.invite.memberId === invite.memberId;

  return (
    <Widget label="초대 대기" title="초대 대기" note={model.inviteNote} className="col-span-full">
      <div className="flex flex-col border-t border-border">
        {!rows && loading && <LoadingState variant="inline" message="초대 목록을 불러오는 중입니다…" className="py-5" />}
        {error && <ErrorState variant="inline" className="py-3" message={error.message} retrying={retrying} onRetry={onRetry} />}
        {rows?.length === 0 && <p className="py-5 text-center text-xs text-text3">초대 대기 중인 구성원이 없습니다</p>}
        {rows?.map((invite) => {
          const code = reissued[invite.memberId];
          const failed = action.isError && action.variables.invite.memberId === invite.memberId ? action.error : null;
          return <div
            key={invite.invitationId}
            className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-border px-0.5 py-2.5"
          >
            <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5" style={{ opacity: invite.expired ? 0.7 : 1 }}>
              <span className="overflow-hidden font-mono text-[12.5px] text-ellipsis whitespace-nowrap">
                {invite.email}
              </span>
              <span className="text-[11px] text-text3">
                {invite.teamLabel} · {invite.roleLabel} · {invite.issuedText}
              </span>
            </div>

            <span
              className="tnum min-w-20 shrink-0 text-right text-[12px]"
              style={{ color: invite.expiryColor }}
            >
              {invite.expiryText}
            </span>

            {editable && <div className="flex shrink-0 items-center gap-1.5">
              <Button size="sm" disabled={action.isPending} aria-label={`${invite.email} 초대 팀/역할 수정`} onClick={() => onEdit(invite)}>팀/역할 수정</Button>
              <Button size="sm" variant={invite.expired ? "primary" : "default"} disabled={action.isPending} loading={running("reissue", invite)} loadingLabel="발급 중…"
                aria-label={`${invite.email} 초대 코드 재발급`} onClick={() => run("reissue", invite)}>코드 재발급</Button>
              <Button size="sm" disabled={action.isPending} aria-label={`${invite.email} 초대 취소`} onClick={() => { action.reset(); setConfirming(invite.memberId); }}>초대 취소</Button>
            </div>}

            {confirming === invite.memberId && <div role="alert" className="flex w-full flex-wrap items-center gap-2 rounded-md border border-red bg-red-tint px-3 py-2.5">
              <span className="flex-1 text-[11.5px]">초대 코드를 폐기합니다. 폐기한 코드로는 가입하거나 설치할 수 없습니다.</span>
              <Button size="sm" disabled={action.isPending} onClick={() => setConfirming(null)}>되돌리기</Button>
              <Button size="sm" loading={running("revoke", invite)} loadingLabel="취소 중…" disabled={action.isPending} onClick={() => run("revoke", invite)}>초대 취소 확인</Button>
            </div>}
            {code && <div role="status" className="flex w-full flex-col gap-2 rounded-md bg-sub px-3 py-2.5 text-[11.5px] text-text2">
              <span>새 초대 코드를 발급했습니다. 이전 코드는 더 이상 쓸 수 없습니다 · {formatKst(code.expiresAt)} 만료. 코드는 지금만 볼 수 있으니 대상자에게 직접 전달하세요.</span>
              <span className="flex flex-wrap items-center gap-2">
                <InviteCode email={invite.email} code={code.code} />
                <Button size="sm" variant="ghost" aria-label={`${invite.email} 초대 코드 숨기기`}
                  onClick={() => setReissued((previous) => Object.fromEntries(Object.entries(previous).filter(([memberId]) => memberId !== invite.memberId)))}>숨기기</Button>
              </span>
            </div>}
            {failed && <ErrorState variant="panel" className="w-full" message={failed.message} />}
          </div>;
        })}
      </div>
    </Widget>
  );
}
