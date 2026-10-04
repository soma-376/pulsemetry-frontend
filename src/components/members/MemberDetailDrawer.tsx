"use client";

import { useId, useState, type ReactNode } from "react";
import { DetailDrawer } from "@/components/ui/DetailDrawer";
import { InstallationCodePanel } from "./InstallationCodePanel";
import { MemberEditForm, type MemberEditTarget } from "./MemberEditForm";
import { MemberSeatDetails } from "./MemberSeatDetails";
import { MemberStatusBadges } from "./MemberStatusBadges";
import type { createCommands, ServerTeam } from "@/lib/api/management";
import type { InviteRow, MemberRow } from "@/lib/members-view";

/** 상세에 올릴 대상 — 명단의 구성원이거나 아직 합류하지 않은 초대 대기자. */
export type MemberSubject = { kind: "member"; row: MemberRow } | { kind: "invite"; row: InviteRow };

type Props = {
  organizationId: string;
  post: ReturnType<typeof createCommands>;
  subject: MemberSubject | null;
  open: boolean;
  teams: ServerTeam[];
  /** 로그인한 사용자의 memberId */
  currentMemberId: string;
  editable: boolean;
  onClose: () => void;
  onAfterClose: () => void;
  onSaved: (message: string) => void;
  onReload: () => Promise<MemberEditTarget>;
};

const Field = ({ label, children }: { label: string; children: ReactNode }) =>
  <div><dt className="mb-1 text-[11px] text-text3">{label}</dt><dd className="tnum break-words">{children}</dd></div>;

/** 처음 펼칠 때 조회하고, 접었다 펼쳐도 방금 발급한 코드와 진행 중인 작업을 유지한다. */
function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  const [state, setState] = useState<"initial" | "expanded" | "collapsed">("initial");
  const expanded = state === "expanded";
  return <section aria-label={title} className="border-t border-border pt-4">
    <h3>
      <button type="button" aria-label={title} aria-expanded={expanded} aria-controls={id}
        onClick={() => setState(expanded ? "collapsed" : "expanded")}
        className="flex min-h-9 w-full cursor-pointer items-center justify-between gap-3 rounded-sm text-left text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue">
        <span>{title}</span>
        <span aria-hidden="true" className="text-[11px] font-normal text-text3">{expanded ? "접기" : "펼치기"}</span>
      </button>
    </h3>
    <div id={id} hidden={!expanded} className="pt-3">{state !== "initial" && children}</div>
  </section>;
}

export function editTarget(subject: MemberSubject): MemberEditTarget {
  return subject.kind === "member"
    ? { memberId: subject.row.memberId, account: subject.row.account, teamId: subject.row.teamId, role: subject.row.role, version: subject.row.version, plannedVendorIds: subject.row.plannedVendorIds, invited: false }
    : { memberId: subject.row.memberId, account: subject.row.email, teamId: subject.row.teamId, role: subject.row.role, version: subject.row.memberVersion, plannedVendorIds: subject.row.plannedVendorIds, invited: true };
}

/** 서버가 준 구성원 한 명의 값과 팀·역할 편집. 좌석 배정 상태는 사용 관측 상태와 따로 보여 준다. */
export function MemberDetailDrawer({ organizationId, post, subject, open, teams, currentMemberId, editable, onClose, onAfterClose, onSaved, onReload }: Props) {
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
        {member?.status === "active" && editable && <DetailSection title="설치 코드">
          <InstallationCodePanel organizationId={organizationId} post={post}
            memberId={member.memberId} account={member.account} version={member.version} />
        </DetailSection>}
        {member && <DetailSection title="벤더 좌석">
          {open && <MemberSeatDetails organizationId={organizationId} memberId={member.memberId} editable={editable} />}
        </DetailSection>}
      </div>}
    </DetailDrawer>}
  </MemberEditForm>;
}
