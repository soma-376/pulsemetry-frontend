"use client";

import { useMemo, useState } from "react";
import { CoverageBar } from "@/components/layout/CoverageBar";
import { FilterToolbar } from "@/components/layout/FilterToolbar";
import { IngestDownBanner } from "@/components/layout/IngestDownBanner";
import { InviteModal } from "@/components/members/InviteModal";
import { MemberListCard } from "@/components/members/MemberListCard";
import { MemberDetailDrawer } from "@/components/members/MemberDetailDrawer";
import { PendingInviteCard } from "@/components/members/PendingInviteCard";
import { SeatReclaimCard } from "@/components/members/SeatReclaimCard";
import { UnassignedCard } from "@/components/members/UnassignedCard";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/StatCard";
import { TeamManagement } from "@/components/teams/TeamManagement";
import { useInvitations } from "@/lib/invitations";
import { useOrganization } from "@/lib/organization-store";
import { useFilters } from "@/lib/filters";
import { buildMembers, type MembersModel, type MemberState } from "@/lib/metrics/members";
import { saveMemberAssignment } from "@/lib/member-assignment";

/**
 * P6 구성원.
 *
 * 셸(사이드바·필터 툴바·커버리지 바)과 카드·버튼·셀렉트는 기존 것을 그대로 씁니다.
 * 좌석 회수·팀 배정·초대와 구성원의 팀·역할을 관리합니다.
 */
export function MembersContent() {
  const { dates } = useFilters();

  const { state: organization, update } = useOrganization();
  const state = organization.members;
  const setState = (change: (previous: MemberState) => MemberState) =>
    update((previous) => ({ ...previous, members: change(previous.members) }));
  const [assignPicks, setAssignPicks] = useState<Record<string, string>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [highlightedSeatId, setHighlightedSeatId] = useState<string>();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<MembersModel["memberRows"][number] | null>(null);
  const [editNotice, setEditNotice] = useState("");
  const openDetail = (target: MembersModel["memberRows"][number], seatId?: string) => {
    setHighlightedSeatId(seatId);
    setDrawerOpen(true);
    setEditNotice("");
    setEditing(target);
  };

  const model = useMemo(() => buildMembers(dates, state, organization.teams, organization.seatReviewDays), [dates, state, organization.teams, organization.seatReviewDays]);

  const { send: addInvites, resend: resendInvite, revoke: revokeInvite } = useInvitations();

  const applyAssign = () => {
    const picks = Object.entries(assignPicks).filter(([, team]) => team);
    setState((prev) => ({
      ...prev,
      assigned: { ...prev.assigned, ...Object.fromEntries(picks) },
    }));
    setAssignPicks({});
  };

  return (
    <>
      <FilterToolbar />

      {model.ingest.isDown && (
        <IngestDownBanner
          title={model.ingest.down.title}
          detail={model.ingest.down.detail}
        />
      )}

      <CoverageBar
        dotColor={model.ingest.dot}
        installs={model.ingest.liveInstalls}
        members={model.ingest.liveMembers}
        coverage={model.ingest.liveCoverage}
        ingestText={model.ingest.text}
        ingestColor={model.ingest.fg}
      />

      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-6 pt-5 pb-10">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-[18px] font-semibold tracking-[-0.01em]">구성원</h1>
            <span className="text-[12px] text-text3">{model.pageSub}</span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <TeamManagement />
            <Button variant="primary" className="px-3.5" onClick={() => setInviteOpen(true)}>
              구성원 초대
            </Button>
          </div>
        </div>

        <p role="status" aria-live="polite" className="text-xs text-text2 empty:hidden">{editNotice}</p>
        <div className="grid grid-cols-4 gap-4 @max-[1180px]:grid-cols-2 @max-[620px]:grid-cols-1">
          {model.memberCards.map((c) => (
            <StatCard
              key={c.label}
              label={c.label}
              value={c.value}
              unit={c.unit}
              caption={c.caption}
              tone={c.tone}
            />
          ))}

          <PendingInviteCard
            model={model}
            onResend={resendInvite}
            onRevoke={revokeInvite}
            onEdit={(email) => {
              const member = model.memberRows.find((item) => item.account.toLowerCase() === email.toLowerCase());
              if (member) openDetail(member);
            }}
          />

          <SeatReclaimCard model={model} onReview={(seat) => {
            const member = model.memberRows.find((item) => item.account === seat.account);
            if (member) openDetail(member, seat.id);
          }} />

          <UnassignedCard
            teams={organization.teams}
            model={model}
            picks={assignPicks}
            onPick={(account, team) =>
              setAssignPicks((prev) => ({ ...prev, [account]: team }))
            }
            onApply={applyAssign}
          />

          <MemberListCard model={model} onOpen={openDetail} />
        </div>
      </div>

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        seatStatus={model.seatStatus}
        onInvite={addInvites}
      />
      <MemberDetailDrawer member={model.memberRows.find((member) => member.account === editing?.account) ?? editing}
        open={drawerOpen} teams={organization.teams} asOf={model.seatSnapshotDate} highlightedSeatId={highlightedSeatId} notice={editNotice}
        onClose={() => setDrawerOpen(false)} onAfterClose={() => setEditing(null)} onSave={(target, values) => {
        const next = saveMemberAssignment(organization, target, values);
        update(() => next);
        setAssignPicks((previous) => {
          const remaining = { ...previous };
          delete remaining[target.account];
          return remaining;
        });
        setEditNotice(`${target.account}의 ${target.invited ? "초대 " : ""}팀·역할을 변경했습니다.`);
      }} />
    </>
  );
}
