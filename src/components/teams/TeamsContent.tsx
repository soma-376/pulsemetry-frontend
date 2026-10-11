"use client";

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
import { LoadingState } from "@/components/ui/LoadingState";
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
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-6 pt-5 pb-10">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="order-last">
            <TeamManagement />
          </div>
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-[18px] font-semibold tracking-[-0.01em]">
              팀 분석
            </h1>
            {model && (
              <span role="status" className="text-[12px] text-text3">
                {model.headerNote}
              </span>
            )}
          </div>
        </div>

        {query.isPending && !data && (
          <LoadingState
            message="팀 분석을 불러오는 중입니다…"
            className="min-h-[480px]"
          />
        )}
        {query.error && (
          <ErrorState
            message={
              <>
                {denied(query.error)
                  ? "이 조직의 팀 분석을 조회할 권한이 없습니다."
                  : query.error.message}
                {data && " 마지막으로 조회한 데이터를 표시합니다."}
              </>
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
            <div
              role="status"
              className="flex max-w-[620px] flex-col gap-3.5 rounded-[10px] border border-border bg-card p-[22px]"
            >
              <div className="flex flex-col gap-[5px]">
                <span className="text-[15px] font-semibold">
                  팀별로 비교할 데이터가 없습니다
                </span>
                <span className="pretty text-[12.5px] text-text2">
                  {model.neverObserved
                    ? "데몬 신호가 아직 들어오지 않아 팀 귀속·사용량을 계산할 수 없습니다 · 값을 0으로 표시하지 않습니다"
                    : "선택 기간에 팀에 귀속된 사용이 관측되지 않았습니다 · 기간을 바꿔 확인하세요"}
                </span>
              </div>
              {model.neverObserved && (
                <ButtonLink
                  href={dashboardHref("/overview")}
                  variant="primary"
                  className="h-8 self-start px-[13px]"
                >
                  개요에서 설치 시작
                </ButtonLink>
              )}
            </div>
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
      </div>
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
