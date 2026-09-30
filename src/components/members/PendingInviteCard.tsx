"use client";

import { Widget } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import type { MembersModel } from "@/lib/members-view";

/**
 * 초대 대기.
 *
 * 좌석 회수 후보와 대칭입니다 — 저쪽이 나갈 사람이면 이쪽은 들어올 사람.
 * 아직 합류하지 않은 사람만 보여 줍니다. 수락 전에는 좌석을 차지하지 않으므로 좌석 지표에 더하지 않습니다.
 *
 * 만료된 초대는 코드가 죽어 있어 기다린다고 들어오지 않습니다 — 다시 발급해야 합니다.
 */
export function PendingInviteCard({ model, loading, error, retrying, onRetry }: {
  model: MembersModel;
  loading: boolean;
  error: Error | null;
  retrying: boolean;
  onRetry: () => void;
}) {
  const rows = model.inviteRows;
  return (
    <Widget label="초대 대기" title="초대 대기" note={model.inviteNote} className="col-span-full">
      <div className="flex flex-col border-t border-border">
        {!rows && loading && <LoadingState variant="inline" message="초대 목록을 불러오는 중입니다…" className="py-5" />}
        {error && <ErrorState variant="inline" className="py-3" message={error.message} retrying={retrying} onRetry={onRetry} />}
        {rows?.length === 0 && <p className="py-5 text-center text-xs text-text3">초대 대기 중인 구성원이 없습니다</p>}
        {rows?.map((invite) => (
          <div
            key={invite.invitationId}
            className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-border px-0.5 py-2.5"
            style={{ opacity: invite.expired ? 0.7 : 1 }}
          >
            <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
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
          </div>
        ))}
      </div>
    </Widget>
  );
}
