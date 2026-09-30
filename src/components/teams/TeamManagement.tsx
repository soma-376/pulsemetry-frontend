"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { DetailDrawer } from "@/components/ui/DetailDrawer";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { waitingInvitationsOptions } from "@/lib/api/invitations";
import { teamsOptions } from "@/lib/api/management";
import { membersOptions } from "@/lib/api/members";
import { useBackendSession } from "@/lib/api/session";
import { useFilters } from "@/lib/filters";

/** 조직의 팀 목록. 인원은 현재 명단과 대기 중인 초대에서 센다. */
export function TeamManagement() {
  const session = useBackendSession();
  const organizationId = session?.user.organizationId ?? "";
  const { dates } = useFilters();
  const [open, setOpen] = useState(false);
  const enabled = !!organizationId && open;
  const teams = useQuery({ ...teamsOptions(organizationId), enabled });
  const members = useQuery({ ...membersOptions(organizationId, { startDate: dates.start, endDate: dates.end ?? dates.start }), enabled });
  const invitations = useQuery({ ...waitingInvitationsOptions(organizationId), enabled });
  const count = (values: (string | null | undefined)[] | undefined, teamId: string) => values ? String(values.filter((value) => value === teamId).length) : "-";
  return <>
    <Button onClick={() => setOpen(true)} disabled={!organizationId}>팀 관리</Button>
    <DetailDrawer open={open} onClose={() => setOpen(false)} title="팀 관리" subtitle={teams.data ? `${teams.data.length}개 개발팀 · 사용량과 비용을 함께 볼 단위` : "사용량과 비용을 함께 볼 단위"}>
      <p className="mb-4 text-xs leading-5 text-text3">플랫폼팀, 프론트팀처럼 개발팀 내 프로젝트 그룹을 관리합니다. 새 팀은 사용량이 수집된 뒤 분석에 표시됩니다.</p>
      {teams.isPending && enabled && <LoadingState message="팀 목록을 불러오는 중입니다…" />}
      {teams.error && <ErrorState message={teams.error.message} retrying={teams.isFetching} onRetry={() => void teams.refetch({ cancelRefetch: false })} />}
      {teams.data && <>
        {!teams.data.length && <p className="py-8 text-center text-sm text-text3">아직 팀이 없습니다.</p>}
        <ul aria-label="팀 목록" className="divide-y divide-border">
          {teams.data.map((team) => <li key={team.teamId} className="flex items-center gap-3 py-4">
            <span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{team.teamName}</span>
              <span className="mt-1 block text-xs text-text3">구성원 {count(members.data?.members.map((member) => member.team.teamId), team.teamId)}명 · 초대 {count(invitations.data?.map((invite) => invite.team?.teamId), team.teamId)}명</span></span>
          </li>)}
        </ul>
      </>}
    </DetailDrawer>
  </>;
}
