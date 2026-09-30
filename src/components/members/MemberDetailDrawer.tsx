"use client";

import { DetailDrawer } from "@/components/ui/DetailDrawer";
import { MemberEditForm, type MemberEditTarget } from "./MemberEditForm";
import { MemberStatusBadges } from "./MemberStatusBadges";
import type { ServerTeam } from "@/lib/api/management";
import type { InviteRow, MemberRow } from "@/lib/members-view";

/** 상세에 올릴 대상 — 명단의 구성원이거나 아직 합류하지 않은 초대 대기자. */
export type MemberSubject = { kind: "member"; row: MemberRow } | { kind: "invite"; row: InviteRow };

type Props = {
  organizationId: string;
  subject: MemberSubject | null;
  open: boolean;
  /** 조회 기간 (YYYY-MM-DD) */
  period: { startDate: string; endDate: string };
  teams: ServerTeam[];
  /** 로그인한 사용자의 memberId */
  currentMemberId: string;
  editable: boolean;
  onClose: () => void;
  onAfterClose: () => void;
  onSaved: (message: string) => void;
  onReload: () => Promise<MemberEditTarget>;
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) =>
  <div><dt className="mb-1 text-[11px] text-text3">{label}</dt><dd className="tnum break-words">{children}</dd></div>;

export function editTarget(subject: MemberSubject): MemberEditTarget {
  return subject.kind === "member"
    ? { memberId: subject.row.memberId, account: subject.row.account, teamId: subject.row.teamId, role: subject.row.role, version: subject.row.version, invited: false }
    : { memberId: subject.row.memberId, account: subject.row.email, teamId: subject.row.teamId, role: subject.row.role, version: subject.row.memberVersion, invited: true };
}

/** 서버가 준 구성원 한 명의 값과 팀·역할 편집. 좌석 배정 상태는 사용 관측 상태와 따로 보여 준다. */
export function MemberDetailDrawer({ organizationId, subject, open, period, teams, currentMemberId, editable, onClose, onAfterClose, onSaved, onReload }: Props) {
  const target = subject ? editTarget(subject) : null;
  const member = subject?.kind === "member" ? subject.row : null;
  const invite = subject?.kind === "invite" ? subject.row : null;
  return <MemberEditForm key={target?.memberId ?? "empty"} organizationId={organizationId} target={target} teams={teams}
    self={target?.memberId === currentMemberId} editable={editable} onSaved={onSaved} onReload={onReload}>
    {({ fields, actions }) => <DetailDrawer open={open} onClose={onClose} onAfterClose={onAfterClose} title="구성원 상세" subtitle={target?.account}
      footer={target && editable ? actions : undefined}>
      {target && <div className="flex flex-col gap-7">
        {member && <MemberStatusBadges status={member.activity} />}
        <section aria-label="팀 및 역할">
          <h3 className="mb-3 text-[13px] font-semibold">팀 · 역할</h3>
          <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
            {member && <Field label="이름">{member.displayName}</Field>}
            <Field label="계정 상태">{member ? member.stateLabel : "초대 대기"}</Field>
            {invite && <Field label="초대 코드">{invite.issuedText} · {invite.expiryText}</Field>}
          </dl>
          {fields}
        </section>
        {member && <>
          <section aria-label="기간 사용">
            <h3 className="mb-3 text-[13px] font-semibold">기간 사용</h3>
            <p className="mb-3 text-[11px] leading-5 text-text3">{period.startDate.replaceAll("-", ".")} ~ {period.endDate.replaceAll("-", ".")}</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <Field label="사용 환산액">{member.costText}</Field>
              <Field label="세션">{member.sessionText}</Field>
              <div className="col-span-2"><Field label="마지막 사용">{member.lastSeen}</Field></div>
            </dl>
          </section>
          <section aria-label="벤더 좌석">
            <h3 className="mb-3 text-[13px] font-semibold">벤더 좌석</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <Field label="배정 상태">{member.seatStateLabel}</Field>
            </dl>
          </section>
        </>}
      </div>}
    </DetailDrawer>}
  </MemberEditForm>;
}
