"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Widget } from "@/components/ui/Card";
import { INVITE_TTL_DAYS, type MembersModel } from "@/lib/metrics/members";

type ResendState = "sending" | "sent" | "error";

/**
 * 초대 대기.
 *
 * 좌석 회수 후보와 대칭입니다 — 저쪽이 나갈 사람이면 이쪽은 들어올 사람.
 * 수락 전에는 좌석을 차지하지 않으므로 위의 좌석 지표에는 더하지 않고,
 * "모두 수락하면" 전망만 카드 설명에 적습니다.
 *
 * 만료된 초대는 링크가 죽어 있어 기다린다고 들어오지 않습니다 — 다시 보내야 합니다.
 */
export function PendingInviteCard({
  model,
  onResend,
  onRevoke,
  onEdit,
}: {
  model: MembersModel;
  onResend: (email: string) => void | Promise<void>;
  onRevoke: (email: string) => void;
  onEdit?: (email: string) => void;
}) {
  const [resends, setResends] = useState<Record<string, ResendState | undefined>>({});
  const pending = useRef(new Set<string>());
  const resend = async (email: string) => {
    if (pending.current.has(email)) return;
    pending.current.add(email);
    setResends((previous) => ({ ...previous, [email]: "sending" }));
    try {
      await onResend(email);
      setResends((previous) => ({ ...previous, [email]: "sent" }));
    } catch {
      setResends((previous) => ({ ...previous, [email]: "error" }));
    } finally {
      pending.current.delete(email);
    }
  };

  return (
    <Widget
      label="초대 대기"
      title="초대 대기"
      note={model.inviteNote}
      className="col-span-full"
    >
      <div className="flex flex-col border-t border-border">
        {model.inviteRows.length === 0 && <p className="py-5 text-center text-xs text-text3">초대 대기 중인 구성원이 없습니다</p>}
        {model.inviteRows.map((invite) => (
          <div
            key={invite.email}
            className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-border px-0.5 py-2.5"
            style={{ opacity: invite.expired ? 0.7 : 1 }}
          >
            <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
              <span className="overflow-hidden font-mono text-[12.5px] text-ellipsis whitespace-nowrap">
                {invite.email}
              </span>
              <span className="text-[11px] text-text3">
                {invite.teamLabel} · {invite.roleLabel} · {invite.invitedAt} 발송
              </span>
            </div>

            <span
              className="tnum min-w-20 shrink-0 text-right text-[12px]"
              style={{ color: invite.expiryColor }}
            >
              {invite.expiryText}
            </span>

            <div className="flex shrink-0 items-center gap-1.5">
              {onEdit && <Button size="sm" disabled={resends[invite.email] === "sending"} aria-label={`${invite.email} 초대 팀/역할 수정`} onClick={() => onEdit(invite.email)}>팀/역할 수정</Button>}
              <Button
                size="sm"
                variant={invite.expired ? "primary" : "default"}
                disabled={resends[invite.email] === "sending"}
                aria-busy={resends[invite.email] === "sending"}
                onClick={() => void resend(invite.email)}
              >
                {resends[invite.email] === "sending" ? "보내는 중…" : "다시 보내기"}
              </Button>
              <Button size="sm" disabled={resends[invite.email] === "sending"} onClick={() => {
                setResends((previous) => ({ ...previous, [invite.email]: undefined }));
                onRevoke(invite.email);
              }}>
                취소
              </Button>
            </div>
            <div role="status" aria-live="polite" aria-atomic="true" className="w-full text-[11.5px] text-text2 empty:hidden">
              {resends[invite.email] === "sending" && "초대 메일 재발송을 처리하고 있습니다…"}
              {resends[invite.email] === "sent" && `재발송 처리가 완료되었습니다. 초대 유효기간은 ${INVITE_TTL_DAYS}일입니다. (데모 · 실제 메일 미발송)`}
            </div>
            {resends[invite.email] === "error" && <p role="alert" className="w-full text-[11.5px] text-red">재발송하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>}
          </div>
        ))}
      </div>
    </Widget>
  );
}
