"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDashboardPageRefresh } from "@/components/layout/DashboardHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { InviteModal } from "@/components/members/InviteModal";
import { editTarget, MemberDetailDrawer, type MemberSubject } from "@/components/members/MemberDetailDrawer";
import { MemberListCard } from "@/components/members/MemberListCard";
import { PendingInviteCard } from "@/components/members/PendingInviteCard";
import { SeatReclaimCard } from "@/components/members/SeatReclaimCard";
import { UnassignedCard } from "@/components/members/UnassignedCard";
import { TeamManagement } from "@/components/teams/TeamManagement";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { StatCard } from "@/components/ui/StatCard";
import { Toast, useToast } from "@/components/ui/Toast";
import { DELIVERY_POLL_MS, deliveryPending, issueInvitations, waitingInvitationsOptions, type InvitationRequest } from "@/lib/api/invitations";
import { createCommands, ManagementError, teamsOptions } from "@/lib/api/management";
import { assignTeams, teamAssignments } from "@/lib/api/member-commands";
import { membersOptions } from "@/lib/api/members";
import { organizationKey } from "@/lib/api/query-keys";
import { useBackendSession } from "@/lib/api/session";
import { useFilters } from "@/lib/filters";
import { buildMembersView, membersCsv, type MembersModel } from "@/lib/members-view";

/**
 * P6 구성원.
 *
 * 명단·요약·미배정은 한 snapshot의 서버 응답이고, 초대 대기와 팀 목록은 독립 조회다.
 * 한 조회의 실패가 다른 정상 영역을 지우지 않는다.
 * 팀·역할·초대의 변경은 서버 명령이고, 서버가 확정한 뒤에 다시 조회한 값으로 화면을 바꾼다.
 */
export function MembersContent() {
  const session = useBackendSession();
  // 세션이 없을 때의 안내는 대시보드 레이아웃의 SessionGate 하나가 맡는다.
  if (!session) return null;
  return <OrganizationMembers key={session.user.organizationId} organizationId={session.user.organizationId} currentMemberId={session.user.memberId} />;
}

const denied = (error: Error | null) => error instanceof ManagementError && [401, 403].includes(error.status);

type Selection = { kind: MemberSubject["kind"]; memberId: string };
function subjectOf(model: MembersModel | null, selection: Selection | null): MemberSubject | null {
  if (!model || !selection) return null;
  if (selection.kind === "member") {
    const row = model.memberRows.find((member) => member.memberId === selection.memberId);
    return row ? { kind: "member", row } : null;
  }
  const row = model.inviteRows?.find((invite) => invite.memberId === selection.memberId);
  return row ? { kind: "invite", row } : null;
}

function OrganizationMembers({ organizationId, currentMemberId }: { organizationId: string; currentMemberId: string }) {
  const client = useQueryClient();
  const { dates, autoRefresh } = useFilters();
  const period = { startDate: dates.start, endDate: dates.end ?? dates.start };
  const refetchInterval = autoRefresh ? 300_000 : false as const;
  const query = useQuery({ ...membersOptions(organizationId, period), refetchInterval });
  // 발송이 끝나지 않은 초대가 있으면 발송 작업의 결과가 보일 때까지 짧은 주기로 다시 읽는다.
  const invitations = useQuery({ ...waitingInvitationsOptions(organizationId),
    refetchInterval: (current) => deliveryPending(current.state.data) ? DELIVERY_POLL_MS : refetchInterval });
  const teams = useQuery(teamsOptions(organizationId));
  const [selected, setSelected] = useState<Selection | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [post] = useState(createCommands);
  const { toast, showToast, dismissToast } = useToast();

  // 권한이 거부되면 이전에 받은 값도 보여 주지 않는다.
  const forbidden = [query.error, invitations.error, teams.error].some(denied);
  const data = forbidden ? undefined : query.data;
  const invitationData = forbidden || invitations.error ? undefined : invitations.data;
  const model = useMemo(() => data ? buildMembersView(data, invitationData) : null, [data, invitationData]);
  const refresh = () => void Promise.all([query, invitations, teams].map((item) => item.refetch({ cancelRefetch: false })));
  useDashboardPageRefresh(refresh, query.isFetching || invitations.isFetching || teams.isFetching);

  const openDetail = (kind: Selection["kind"], memberId: string) => { setSelected({ kind, memberId }); setDrawerOpen(true); };
  const invalidate = () => client.invalidateQueries({ queryKey: organizationKey(organizationId) });
  const assign = useMutation({
    retry: false,
    mutationFn: async () => {
      const assignments = teamAssignments(model?.unassignedRows ?? [], picks);
      if (!assignments.length) throw new Error("배정할 구성원을 선택하세요.");
      await assignTeams(post, organizationId, assignments);
      // 목록을 새로 읽은 뒤에 끝낸다. 갱신 실패는 저장 실패가 아니다.
      await invalidate();
      return assignments;
    },
    onSuccess: (assignments) => {
      setPicks((previous) => Object.fromEntries(Object.entries(previous).filter(([memberId]) => !assignments.some((item) => item.memberId === memberId))));
      showToast(`${assignments.length}명을 팀에 배정했습니다.`);
    },
    onError: (error) => { if (error instanceof ManagementError && error.code === "not_found") void invalidate(); },
  });
  // 다시 읽지 못했으면 낡은 목록으로 재시도하게 두지 않는다.
  const reloadUnassigned = useMutation({
    retry: false,
    mutationFn: async () => { for (const result of await Promise.all([query.refetch(), teams.refetch()])) if (result.error) throw result.error; },
    onSuccess: () => assign.reset(),
  });
  const invite = async (entries: InvitationRequest[]) => {
    const results = await issueInvitations(post, organizationId, entries);
    await invalidate();
    return results;
  };
  // 충돌 뒤에는 명단과 초대를 다시 읽어 그 구성원의 최신 값을 돌려준다.
  const reloadSubject = async () => {
    const [latestMembers, latestInvitations] = await Promise.all([query.refetch(), invitations.refetch()]);
    const failed = latestMembers.error ?? (selected?.kind === "invite" ? latestInvitations.error : null);
    if (failed) throw failed;
    const latest = subjectOf(latestMembers.data ? buildMembersView(latestMembers.data, latestInvitations.data) : null, selected);
    if (!latest) throw new Error("구성원을 더 이상 찾을 수 없습니다. 목록을 확인하세요.");
    return editTarget(latest);
  };
  const capabilities = model?.capabilities;
  const exportCsv = () => {
    if (!model) return;
    // 화면의 필터·정렬과 무관하게 같은 snapshot의 전체 명단을 내보낸다.
    const url = URL.createObjectURL(new Blob(["﻿", membersCsv(model.memberRows)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `members_${model.period.startDate}_${model.period.endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return <>
    <PageContainer className="flex flex-col gap-4 pt-5 pb-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-[18px] font-semibold tracking-[-0.01em]">구성원</h1>
          <span className="text-[12px] text-text3">전체 구성원 · 팀·역할 및 벤더 좌석 관리</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {data && query.isFetching && <LoadingState variant="inline" message="구성원을 새로고침하는 중입니다…" />}
          <TeamManagement />
          <Button variant="primary" className="px-3.5" disabled={!capabilities?.invite} onClick={() => setInviteOpen(true)}>구성원 초대</Button>
        </div>
      </div>

      {query.error && <ErrorState
        message={<>{query.error.message}{data && " 마지막으로 조회한 명단을 표시합니다."}</>}
        retrying={query.isFetching} onRetry={() => void query.refetch({ cancelRefetch: false })} />}
      {teams.error && !denied(teams.error) && <ErrorState message={`팀 목록을 불러오지 못했습니다. ${teams.error.message}`} retrying={teams.isFetching} onRetry={() => void teams.refetch({ cancelRefetch: false })} />}
      {!data && !forbidden && query.isPending && <LoadingState message="구성원을 불러오는 중입니다…" className="min-h-[480px]" />}

      {model && <div className="grid grid-cols-4 gap-4 @max-[1180px]:grid-cols-2 @max-[620px]:grid-cols-1">
        {model.memberCards.map((c) => (
          <StatCard key={c.label} label={c.label} value={c.value} unit={c.unit} caption={c.caption} tone={c.tone} />
        ))}

        <PendingInviteCard organizationId={organizationId} post={post} model={model} loading={invitations.isPending}
          error={denied(invitations.error) ? null : invitations.error} retrying={invitations.isFetching} onRetry={() => void invitations.refetch({ cancelRefetch: false })}
          editable={model.capabilities.invite} onEdit={(row) => openDetail("invite", row.memberId)} onRevoked={showToast} />

        <SeatReclaimCard organizationId={organizationId} model={model} onReview={(memberId) => openDetail("member", memberId)} />

        <UnassignedCard teams={teams.data ?? []} model={model} picks={picks}
          onPick={(memberId, teamId) => { assign.reset(); setPicks((previous) => ({ ...previous, [memberId]: teamId })); }}
          onApply={() => { if (!assign.isPending) assign.mutate(); }} disabled={!model.capabilities.assignTeam || !teams.data}
          saving={assign.isPending} error={reloadUnassigned.error ?? assign.error}
          conflict={assign.error instanceof ManagementError && assign.error.code === "version_conflict"}
          reloading={reloadUnassigned.isPending} onReload={() => reloadUnassigned.mutate()} />

        <MemberListCard model={model} onOpen={(member) => openDetail("member", member.memberId)} onExport={exportCsv} />
      </div>}
    </PageContainer>

    <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} subtitle="초대 코드를 발급합니다 · 벤더 좌석은 별도로 배정합니다"
      teams={teams.data} onInvite={invite} />
    {model && <MemberDetailDrawer organizationId={organizationId} subject={subjectOf(model, selected)} teams={teams.data ?? []}
      currentMemberId={currentMemberId} editable={model.capabilities.assignTeam}
      open={drawerOpen} period={model.period} onClose={() => setDrawerOpen(false)} onAfterClose={() => setSelected(null)}
      onSaved={(message) => { showToast(message); setDrawerOpen(false); }} onReload={reloadSubject} />}
    <Toast toast={toast} onDismiss={dismissToast} />
  </>;
}
