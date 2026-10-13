"use client";

import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useDashboardPageExport,
  useDashboardPageRefresh,
} from "@/components/layout/DashboardHeader";
import { ModelScatterCard } from "@/components/teams/ModelScatterCard";
import { TeamAxisPanel } from "@/components/teams/TeamAxisPanel";
import { TeamDetailDrawer } from "@/components/teams/TeamDetailDrawer";
import { TeamVendorMixCard } from "@/components/teams/TeamVendorMixCard";
import { UserUsageCard } from "@/components/teams/UserUsageCard";
import { TeamManagement } from "@/components/teams/TeamManagement";
import { ButtonLink } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { refreshFeedback } from "@/components/ui/RefreshNotice";
import { EmptyState } from "@/components/ui/EmptyState";
import { PeriodEmptyState } from "@/components/ui/PeriodEmptyState";
import { TeamsSkeleton } from "./TeamsSkeleton";
import { ManagementError } from "@/lib/api/management";
import { useBackendSession } from "@/lib/api/session";
import {
  fetchTeams,
  fetchTeamUsers,
  teamDetailOptions,
  teamsKey,
  teamsOptions,
  UNASSIGNED,
  type TeamsPeriod,
  type TeamsView,
  type TeamUser,
} from "@/lib/api/teams";
import { useFilters, useDashboardHref } from "@/lib/filters";
import {
  presentTeams,
  teamDetail,
  type AxisKey,
} from "@/lib/metrics/teams-presentation";
import { downloadCsv, teamsCsv } from "@/lib/csv-export";

/**
 * P2 팀 분석.
 * 팀 목록·조직 합계·산점도·미배정은 한 snapshot의 서버 응답(`GET O/analytics/teams`, 모든 페이지)이고,
 * 드로어는 그 행의 값을, 사용자 표는 같은 snapshot의 사용자 조회를 쓴다. 축 선택과 선 표시 여부만 화면 상태다.
 */
export function TeamsContent({ initialTeamId }: { initialTeamId?: string }) {
  const session = useBackendSession();
  // 세션이 없을 때의 안내는 대시보드 레이아웃의 SessionGate 하나가 맡는다.
  if (!session) return null;
  return (
    <OrganizationTeams
      key={session.user.organizationId}
      organizationId={session.user.organizationId}
      initialTeamId={initialTeamId}
    />
  );
}

const denied = (error: Error | null) =>
  error instanceof ManagementError && [401, 403].includes(error.status);

function OrganizationTeams({
  organizationId,
  initialTeamId,
}: {
  organizationId: string;
  initialTeamId?: string;
}) {
  const dashboardHref = useDashboardHref();
  const client = useQueryClient();
  const { compare, dates, autoRefresh } = useFilters();
  const period: TeamsPeriod = {
    startDate: dates.start,
    endDate: dates.end ?? dates.start,
    compare,
  };
  const query = useQuery({
    ...teamsOptions(organizationId, period),
    refetchInterval: autoRefresh ? 300_000 : false,
  });
  const data = denied(query.error) ? undefined : query.data;
  const model = useMemo(() => data && presentTeams(data), [data]);

  const [axis, setAxis] = useState<AxisKey>("cost");
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string | null>(
    initialTeamId ?? null,
  );
  const [detailOpen, setDetailOpen] = useState(!!initialTeamId);
  const listed = model?.details.find((team) => team.key === selected);
  // 행에 드로어 값이 있으므로 같은 snapshot에서는 다시 조회하지 않는다. 직접 링크로 연 팀이 목록에 없을 때만 상세를 부른다.
  const detailQuery = useQuery({
    ...teamDetailOptions(
      organizationId,
      selected ?? "",
      period,
      model?.snapshotId ?? "",
    ),
    enabled: !!model && !!selected && !listed && detailOpen,
  });
  const detail =
    listed ??
    (detailQuery.data && model
      ? teamDetail(detailQuery.data, model.showDelta)
      : undefined);

  const refreshList = useCallback(
    () => void client.invalidateQueries({ queryKey: teamsKey(organizationId) }),
    [client, organizationId],
  );
  useDashboardPageRefresh(
    () => void query.refetch({ cancelRefetch: false }),
    query.isFetching,
    data ? refreshFeedback(query) : undefined,
  );
  const session = useBackendSession();
  // 사용자 표에서 고른 팀(공통 헤더의 CSV 가 그 팀의 사용자를 내보낸다).
  const [usersTeam, setUsersTeam] = useState<string | null>(null);
  // 팀 목록 전 페이지(화면과 같은 snapshot)와, 사용자 표에서 고른 팀의 사용자 전부. 사용자 페이지를 읽다 snapshot 이 만료되면 처음부터 한 번 다시 읽는다.
  const exportTeams = async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        const view: TeamsView =
          attempt === 0 && data
            ? data
            : await fetchTeams(organizationId, period);
        let chosen: {
          teamId: string;
          teamName: string;
          users: TeamUser[];
        } | null = null;
        if (usersTeam) {
          const users: TeamUser[] = [];
          let cursor: string | null = null;
          do {
            const page = await fetchTeamUsers(
              organizationId,
              usersTeam,
              period,
              view.meta.snapshotId,
              cursor,
            );
            users.push(...page.users.items);
            cursor = page.users.nextCursor;
          } while (cursor);
          const teamName =
            view.teams.find((team) => team.teamId === usersTeam)?.teamName ??
            (usersTeam === UNASSIGNED ? view.unassigned.teamName : usersTeam);
          chosen = { teamId: usersTeam, teamName, users };
        }
        downloadCsv(
          `teams_${view.meta.startDate}_${view.meta.endDate}.csv`,
          teamsCsv(
            view,
            session?.user.organizationName ?? organizationId,
            new Date().toISOString(),
            chosen,
          ),
        );
        return;
      } catch (error) {
        if (
          attempt === 0 &&
          error instanceof ManagementError &&
          error.code === "snapshot_expired"
        )
          continue;
        throw error;
      }
    }
  };
  useDashboardPageExport(
    data ? exportTeams : null,
    "팀 분석을 불러온 뒤 내보낼 수 있습니다",
  );

  const toggleTeam = (key: string) =>
    setHidden((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <>
      <PageContainer className="flex flex-col gap-6 pt-6 pb-10">
        <PageHeader page="teams" actions={<TeamManagement />} />

        {query.isPending && !data && <TeamsSkeleton />}
        {!data && query.error && (
          <ErrorState
            message={
              denied(query.error)
                ? "이 조직의 팀 분석을 조회할 권한이 없습니다."
                : query.error.message
            }
            onRetry={
              denied(query.error)
                ? undefined
                : () => void query.refetch({ cancelRefetch: false })
            }
            retrying={query.isFetching}
            retryLabel="다시 시도"
          />
        )}

        {model &&
          (model.isEmpty ? (
            model.neverObserved ? (
              <EmptyState
                message="아직 수집된 신호가 없습니다"
                description="첫 데이터가 수집되면 팀별 사용량을 확인할 수 있습니다."
                className="min-h-[240px] w-full"
                action={
                  <ButtonLink
                    href={dashboardHref("/overview")}
                    variant="primary"
                  >
                    개요에서 설치 시작
                  </ButtonLink>
                }
              />
            ) : (
              <PeriodEmptyState />
            )
          ) : (
            <div className="flex flex-col gap-4">
              <TeamAxisPanel
                model={model}
                axis={axis}
                onAxisChange={setAxis}
                hidden={hidden}
                onToggleTeam={toggleTeam}
                onOpenTeam={(key) => {
                  setSelected(key);
                  setDetailOpen(true);
                }}
              />

              <div className="grid grid-cols-5 gap-4 @max-[1100px]:grid-cols-1">
                <ModelScatterCard model={model} />
                <TeamVendorMixCard model={model} axis={axis} />
              </div>

              <UserUsageCard
                key={model.snapshotId}
                organizationId={organizationId}
                period={{
                  startDate: period.startDate,
                  endDate: period.endDate,
                }}
                snapshotId={model.snapshotId}
                teams={model.teams}
                onSnapshotExpired={refreshList}
                onTeamChange={setUsersTeam}
              />
            </div>
          ))}
      </PageContainer>
      <TeamDetailDrawer
        team={detail}
        open={detailOpen && !!model && !!selected && (!!detail || !listed)}
        onClose={() => setDetailOpen(false)}
        periodLabel={model?.periodLabel ?? ""}
        compareLabel={model?.compareLabel ?? ""}
        showDelta={model?.showDelta ?? false}
        comparisonReason={model?.comparisonReason ?? ""}
        loading={!detail && detailQuery.isFetching}
        error={
          !detail && detailQuery.error
            ? detailQuery.error instanceof ManagementError &&
              detailQuery.error.status === 404
              ? "이 팀을 찾을 수 없습니다. 팀 목록을 다시 확인해 주세요."
              : detailQuery.error.message
            : undefined
        }
        onRetry={() => void detailQuery.refetch({ cancelRefetch: false })}
      />
    </>
  );
}
