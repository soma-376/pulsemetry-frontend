"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDashboardPageRefresh } from "@/components/layout/DashboardHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { MemberDetailDrawer } from "@/components/members/MemberDetailDrawer";
import { MemberListCard } from "@/components/members/MemberListCard";
import { PendingInviteCard } from "@/components/members/PendingInviteCard";
import { SeatReclaimCard } from "@/components/members/SeatReclaimCard";
import { UnassignedCard } from "@/components/members/UnassignedCard";
import { TeamManagement } from "@/components/teams/TeamManagement";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { StatCard } from "@/components/ui/StatCard";
import { waitingInvitationsOptions } from "@/lib/api/invitations";
import { ManagementError, teamsOptions } from "@/lib/api/management";
import { membersOptions } from "@/lib/api/members";
import { useBackendSession } from "@/lib/api/session";
import { useFilters } from "@/lib/filters";
import { buildMembersView, membersCsv } from "@/lib/members-view";

/**
 * P6 구성원.
 *
 * 명단·요약·미배정은 한 snapshot의 서버 응답이고, 초대 대기와 팀 목록은 독립 조회다.
 * 한 조회의 실패가 다른 정상 영역을 지우지 않는다.
 */
export function MembersContent() {
  const session = useBackendSession();
  if (!session) return <div className="p-6 text-sm text-text2">구성원을 조회하려면 <a href="/login" className="underline">로그인</a>해 주세요.</div>;
  return <OrganizationMembers key={session.user.organizationId} organizationId={session.user.organizationId} />;
}

const denied = (error: Error | null) => error instanceof ManagementError && [401, 403].includes(error.status);

function OrganizationMembers({ organizationId }: { organizationId: string }) {
  const { dates, autoRefresh } = useFilters();
  const period = { startDate: dates.start, endDate: dates.end ?? dates.start };
  const refetchInterval = autoRefresh ? 300_000 : false as const;
  const query = useQuery({ ...membersOptions(organizationId, period), refetchInterval });
  const invitations = useQuery({ ...waitingInvitationsOptions(organizationId), refetchInterval });
  const teams = useQuery(teamsOptions(organizationId));
  const [selected, setSelected] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 권한이 거부되면 이전에 받은 값도 보여 주지 않는다.
  const forbidden = [query.error, invitations.error, teams.error].some(denied);
  const data = forbidden ? undefined : query.data;
  const invitationData = forbidden || invitations.error ? undefined : invitations.data;
  const model = useMemo(() => data ? buildMembersView(data, invitationData) : null, [data, invitationData]);
  const refresh = () => void Promise.all([query, invitations, teams].map((item) => item.refetch({ cancelRefetch: false })));
  useDashboardPageRefresh(refresh, query.isFetching || invitations.isFetching || teams.isFetching);

  const openDetail = (memberId: string) => { setSelected(memberId); setDrawerOpen(true); };
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
          <Button variant="primary" className="px-3.5" disabled>구성원 초대</Button>
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

        <PendingInviteCard model={model} loading={invitations.isPending} error={denied(invitations.error) ? null : invitations.error}
          retrying={invitations.isFetching} onRetry={() => void invitations.refetch({ cancelRefetch: false })} />

        <SeatReclaimCard model={model} onReview={openDetail} />

        <UnassignedCard teams={teams.data ?? []} model={model} picks={{}} onPick={() => {}} onApply={() => {}} disabled />

        <MemberListCard model={model} onOpen={(member) => openDetail(member.memberId)} onExport={exportCsv} />
      </div>}
    </PageContainer>

    {model && <MemberDetailDrawer member={model.memberRows.find((member) => member.memberId === selected) ?? null}
      open={drawerOpen} period={model.period} onClose={() => setDrawerOpen(false)} onAfterClose={() => setSelected(null)} />}
  </>;
}
