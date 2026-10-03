"use client";

import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { StatCard } from "@/components/ui/StatCard";
import { SortHeader } from "@/components/ui/SortHeader";
import { ManagementError } from "@/lib/api/management";
import { TEAM_USERS_PAGE, teamUsersOptions } from "@/lib/api/teams";
import { presentUsers, type TeamsModel } from "@/lib/metrics/teams-presentation";
import { nextSort, sortRows, type SortState } from "@/lib/sort";

/**
 * 사용자별 사용량.
 *
 * 팀 값을 개인 단위로 펼칩니다. "평균 대비" 열이 이 표의 핵심 —
 * 팀 비용이 올랐을 때 전원이 조금씩 늘었는지, 몇 명이 크게 늘었는지가 갈립니다.
 * 캐시 적중과 마지막 사용은 각각 낭비와 유휴 좌석의 단서입니다.
 *
 * 서버는 비용 내림차순으로 페이지를 줍니다. 그 순서는 페이지를 이어 붙여 더보기로 넘기고,
 * 다른 열로 정렬하면 모든 페이지를 모은 뒤에 정렬합니다 — 첫 페이지만 정렬하지 않습니다.
 */
const COLS =
  "grid grid-cols-[minmax(0,1.7fr)_64px_88px_100px_78px_minmax(0,1.1fr)_76px_88px] items-center gap-x-[18px] gap-y-2 " +
  // 좁아지면 파생 열부터 접습니다 — 계정·환산 금액·평균 대비는 끝까지 남깁니다
  "@max-[900px]:grid-cols-[minmax(0,1.5fr)_88px_96px_76px_76px] @max-[900px]:gap-x-[14px] " +
  "@max-[900px]:[&>*:nth-child(2)]:hidden @max-[900px]:[&>*:nth-child(6)]:hidden @max-[900px]:[&>*:nth-child(8)]:hidden " +
  "@max-[620px]:grid-cols-[minmax(0,1.3fr)_96px_76px] " +
  "@max-[620px]:[&>*:nth-child(3)]:hidden @max-[620px]:[&>*:nth-child(7)]:hidden";

type SortKey = "account" | "sessionCount" | "tokenValue" | "costValue" | "cacheValue" | "lastValue";
const SERVER_ORDER: SortState<SortKey> = { key: "costValue", direction: "desc" };

export function UserUsageCard({ organizationId, period, snapshotId, teams, onSnapshotExpired, onTeamChange }: {
  organizationId: string;
  period: { startDate: string; endDate: string };
  snapshotId: string;
  teams: TeamsModel["teams"];
  /** 사용자 조회 중 snapshot이 만료되면 목록부터 다시 읽는다(다른 snapshot의 값을 섞지 않는다). */
  onSnapshotExpired: () => void;
  /** 고른 팀을 화면에 알린다 — 공통 헤더의 CSV 가 그 팀의 사용자를 내보낸다. */
  onTeamChange?: (team: string) => void;
}) {
  const [team, setTeam] = useState(teams[0]?.key ?? "");
  const [visible, setVisible] = useState(TEAM_USERS_PAGE);
  const [sort, setSort] = useState<SortState<SortKey>>(SERVER_ORDER);
  const serverOrder = sort.key === SERVER_ORDER.key && sort.direction === SERVER_ORDER.direction;

  const query = useInfiniteQuery({ ...teamUsersOptions(organizationId, team, period, snapshotId), enabled: !!team });
  const pages = useMemo(() => query.data?.pages ?? [], [query.data]);
  const data = useMemo(() => presentUsers(pages), [pages]);
  const loaded = data.rows.length;
  const complete = !!query.data && !query.hasNextPage;
  // 서버 순서가 아니면 모든 페이지가, 서버 순서면 보여 줄 만큼의 페이지가 필요하다.
  const needsMore = !serverOrder || loaded < visible;
  const { hasNextPage, isFetching, isError, fetchNextPage } = query;
  useEffect(() => {
    if (needsMore && hasNextPage && !isFetching && !isError) void fetchNextPage();
  }, [needsMore, hasNextPage, isFetching, isError, fetchNextPage]);
  const expired = query.error instanceof ManagementError && query.error.code === "snapshot_expired";
  useEffect(() => { if (expired) onSnapshotExpired(); }, [expired, onSnapshotExpired]);
  useEffect(() => { if (team) onTeamChange?.(team); }, [team, onTeamChange]);

  const ordered = serverOrder ? data.rows : complete ? sortRows(data.rows, (row) => row[sort.key], sort.direction, (row) => row.account) : [];
  const rows = ordered.slice(0, visible);
  const hasMore = visible < data.totalCount;
  const gathering = !serverOrder && !complete && !query.isError;

  const pick = (next: string) => {
    setTeam(next);
    setVisible(TEAM_USERS_PAGE);
  };
  const deniedAccess = query.error instanceof ManagementError && query.error.status === 403;

  return (
    <section
      id="users"
      aria-label="사용자별 사용량"
      className="flex min-w-0 flex-col rounded-[10px] border border-border bg-card p-5"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold">사용자별 사용량</span>
        {query.data && <span className="pretty text-[11px] text-text3">{data.note}</span>}
      </div>

      <div role="group" aria-label="팀 선택" className="mb-3.5 flex flex-wrap gap-1.5">
        {teams.map((t) => {
          const active = t.key === team;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => pick(t.key)}
              aria-pressed={active}
              className="h-7 cursor-pointer rounded-full border px-[11px] text-[12px] font-medium whitespace-nowrap"
              style={{
                borderColor: active ? "var(--text)" : "var(--border)",
                background: active ? "var(--text)" : "transparent",
                color: active ? "var(--card)" : "var(--text2)",
              }}
            >
              {t.team}
            </button>
          );
        })}
      </div>

      {query.isPending && team ? <LoadingState message="사용자별 사용량을 불러오는 중입니다…" /> : deniedAccess ? (
        <p role="status" className="rounded-lg bg-sub p-3 text-xs text-text2">개인별 사용량을 조회할 권한이 없습니다. 팀 합계는 위 표에서 확인할 수 있습니다.</p>
      ) : query.isError && !query.data ? (
        <ErrorState message={expired ? "목록이 갱신되었습니다. 처음부터 다시 불러옵니다." : query.error.message} onRetry={expired ? undefined : () => void query.refetch({ cancelRefetch: false })} retrying={query.isFetching} />
      ) : query.data && <>
        <div className="mb-[18px] grid grid-cols-5 gap-2 @max-[1100px]:grid-cols-3 @max-[620px]:grid-cols-2">
          {data.stats.map((s) => (
            <StatCard key={s.key} label={s.key} value={s.value} unit={s.sub} tone={s.tone} size="sm" />
          ))}
        </div>

        <div className={`${COLS} border-b border-border px-0.5 pb-2 text-[11px] text-text3`}>
          {([
            ["account", "계정"], ["sessionCount", "세션"], ["tokenValue", "총 토큰"], ["costValue", "환산 금액"],
          ] as const).map(([key, label]) => <SortHeader key={key} label={label} align={key === "account" ? "left" : "right"}
            initial={key === "account" ? "asc" : "desc"} direction={sort.key === key ? sort.direction : undefined}
            onClick={() => setSort(nextSort(sort, key, key === "account" ? "asc" : "desc"))} />)}
          <span className="text-right">평균 대비</span>
          <span>주 사용 모델</span>
          <SortHeader label="캐시 적중" align="right" initial="desc" direction={sort.key === "cacheValue" ? sort.direction : undefined} onClick={() => setSort(nextSort(sort, "cacheValue", "desc"))} />
          <SortHeader label="마지막 사용" align="right" initial="desc" direction={sort.key === "lastValue" ? sort.direction : undefined} onClick={() => setSort(nextSort(sort, "lastValue", "desc"))} />
        </div>

        {gathering && <LoadingState variant="inline" message={`전체 ${data.totalCount}명을 모아 정렬하는 중입니다…`} className="py-3" />}
        {!gathering && data.totalCount === 0 && <p role="status" className="py-3 text-xs text-text3">선택 기간에 이 팀에서 식별된 사용자가 없습니다.</p>}

        {rows.map((u) => (
          <div key={u.key} className={`${COLS} border-b border-border px-0.5 py-2.5`}>
            <span className="overflow-hidden font-mono text-[12px] text-ellipsis whitespace-nowrap text-text2">
              {u.account}
            </span>
            <span className="tnum text-right text-[12px] text-text2">{u.sessions}</span>
            <span className="tnum text-right text-[12px] text-text2">{u.tokens}</span>
            <span className="tnum text-right text-[12px] font-semibold">{u.cost}</span>
            <span
              className="tnum text-right text-[12px] font-semibold"
              style={{ color: u.deviationColor }}
            >
              {u.deviationText}
            </span>
            <span className="overflow-hidden text-[12px] text-ellipsis whitespace-nowrap text-text2">
              {u.model}
            </span>
            <span className="tnum text-right text-[12px]" style={{ color: u.cacheColor }}>
              {u.cache}
            </span>
            <span className="tnum text-right text-[12px]" style={{ color: u.lastColor }}>
              {u.last}
            </span>
          </div>
        ))}

        {query.isError && <ErrorState variant="inline" message={expired ? "목록이 갱신되었습니다. 처음부터 다시 불러옵니다." : query.error.message}
          onRetry={expired ? undefined : () => void query.fetchNextPage()} retrying={query.isFetchingNextPage} className="pt-3" />}

        <div className="flex flex-wrap items-center gap-3 pt-3">
          {hasMore && (
            <Button onClick={() => setVisible((v) => v + TEAM_USERS_PAGE)} disabled={query.isFetchingNextPage || gathering}>
              {query.isFetchingNextPage && serverOrder ? "불러오는 중…" : `다음 ${Math.min(TEAM_USERS_PAGE, data.totalCount - visible)}명 더보기`}
            </Button>
          )}
          <div className="flex-1" />
          <span className="tnum text-[11.5px] whitespace-nowrap text-text2">
            {data.sumNote(rows)}
          </span>
        </div>
      </>}
    </section>
  );
}
