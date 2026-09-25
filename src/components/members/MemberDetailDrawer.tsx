"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { formatSeatActivity, type MemberSeatRow } from "@/lib/metrics/member-seats";
import { DetailDrawer } from "@/components/ui/DetailDrawer";
import { MemberStatusBadges } from "./MemberStatusBadges";
import { MemberEditForm } from "./MemberEditForm";
import { MemberSeatDetails } from "./MemberSeatDetails";
import type { MembersModel } from "@/lib/metrics/members";
import type { MemberAssignmentTarget } from "@/lib/member-assignment";
import type { MemberAssignment } from "@/lib/schemas/member";
import type { Team } from "@/lib/organization";

type Props = {
  member: MembersModel["memberRows"][number] | null;
  open: boolean;
  teams: Team[];
  asOf: string;
  highlightedSeatId?: string;
  notice: string;
  onClose: () => void;
  onAfterClose: () => void;
  onSave: (target: MemberAssignmentTarget, values: MemberAssignment) => void;
};

export function MemberDetailDrawer({ member, open, teams, asOf, highlightedSeatId, notice, onClose, onAfterClose, onSave }: Props) {
  const [reclaiming, setReclaiming] = useState<MemberSeatRow | null>(null);
  return <MemberEditForm key={member?.account ?? "empty"} target={member} teams={teams} onSave={onSave}>
    {({ fields, actions }) => <><DetailDrawer open={open} onClose={onClose} onAfterClose={onAfterClose} title="구성원 상세" subtitle={member?.account}
      footer={actions}>
      {member && <div className="flex flex-col gap-7">
        <MemberStatusBadges status={member.seatStatus} />
        <section aria-label="팀 및 역할">
          <h3 className="mb-3 text-[13px] font-semibold">팀 · 역할</h3>
          {fields}
          <p role="status" className="mt-3 text-xs text-text2 empty:hidden">{notice}</p>
        </section>
        <section aria-label="벤더 좌석">
          <h3 className="mb-3 text-[13px] font-semibold">벤더 좌석</h3>
          <MemberSeatDetails seats={member.vendorSeats} asOf={asOf} highlightedId={highlightedSeatId} unobserved={member.seatStatus.unobserved} onReclaim={setReclaiming} />
        </section>
      </div>}
    </DetailDrawer>
  <Modal open={!!reclaiming} onClose={() => setReclaiming(null)} title="좌석 회수 확인" subtitle={member?.account} width={420}
    footer={<Button onClick={() => setReclaiming(null)}>닫기</Button>}>
    {reclaiming && <div className="flex flex-col gap-4 text-xs">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg bg-sub p-3">
        <dt className="text-text3">벤더</dt><dd>{reclaiming.vendor}</dd>
        <dt className="text-text3">좌석 유형</dt><dd>{reclaiming.tier}</dd>
        <dt className="text-text3">마지막 활동</dt><dd>{formatSeatActivity(reclaiming.lastObservedAt)}</dd>
      </dl>
      <p className="leading-5 text-text2">이 벤더의 좌석만 회수 대상입니다. 다른 벤더 좌석과 구성원의 팀·역할은 유지됩니다.</p>
      <p role="status" className="rounded-lg border border-border p-3 leading-5 text-text3">벤더 좌석 관리가 연결되지 않아 지금은 회수할 수 없습니다. 좌석 배정은 변경되지 않았습니다.</p>
    </div>}
  </Modal></>}
  </MemberEditForm>;
}
