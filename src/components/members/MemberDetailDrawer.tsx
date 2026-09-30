"use client";

import { DetailDrawer } from "@/components/ui/DetailDrawer";
import { MemberStatusBadges } from "./MemberStatusBadges";
import type { MemberRow } from "@/lib/members-view";

type Props = {
  member: MemberRow | null;
  open: boolean;
  /** 조회 기간 (YYYY-MM-DD) */
  period: { startDate: string; endDate: string };
  onClose: () => void;
  onAfterClose: () => void;
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) =>
  <div><dt className="mb-1 text-[11px] text-text3">{label}</dt><dd className="tnum break-words">{children}</dd></div>;

/** 서버가 준 구성원 한 명의 값. 좌석 배정 상태는 사용 관측 상태와 따로 보여 준다. */
export function MemberDetailDrawer({ member, open, period, onClose, onAfterClose }: Props) {
  return <DetailDrawer open={open} onClose={onClose} onAfterClose={onAfterClose} title="구성원 상세" subtitle={member?.account}>
    {member && <div className="flex flex-col gap-7">
      <MemberStatusBadges status={member.activity} />
      <section aria-label="팀 및 역할">
        <h3 className="mb-3 text-[13px] font-semibold">팀 · 역할</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
          <Field label="이름">{member.displayName}</Field>
          <Field label="계정 상태">{member.stateLabel}</Field>
          <Field label="팀"><span style={{ color: member.teamColor }}>{member.team}</span></Field>
          <Field label="역할">{member.roleLabel}</Field>
        </dl>
      </section>
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
    </div>}
  </DetailDrawer>;
}
