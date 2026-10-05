"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TeamForm } from "./TeamForm";
import { Button } from "@/components/ui/Button";
import { DetailDrawer } from "@/components/ui/DetailDrawer";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { waitingInvitationsOptions } from "@/lib/api/invitations";
import { createCommands, ManagementError, teamsOptions, type ServerTeam } from "@/lib/api/management";
import { createTeam, deleteTeam, renameTeam } from "@/lib/api/member-commands";
import { membersOptions } from "@/lib/api/members";
import { organizationKey } from "@/lib/api/query-keys";
import { useBackendSession } from "@/lib/api/session";
import { useFilters } from "@/lib/filters";

const stale = (error: unknown) => error instanceof ManagementError && (error.code === "version_conflict" || error.code === "not_found");

/**
 * 조직의 팀 목록과 팀 만들기·이름 변경·삭제. 인원은 현재 명단과 대기 중인 초대에서 센다.
 * 저장은 서버가 확정한 뒤에만 목록에 반영하고, 다른 곳에서 바뀐 팀은 최신 내용을 다시 읽은 뒤에 고친다.
 */
export function TeamManagement() {
  const session = useBackendSession();
  const organizationId = session?.user.organizationId ?? "";
  const client = useQueryClient();
  const { dates } = useFilters();
  const [open, setOpen] = useState(false);
  // undefined: 목록, null: 새 팀, 팀: 그 팀을 열었을 때의 이름과 version
  const [editing, setEditing] = useState<ServerTeam | null | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState("");
  // 이름 변경이 다른 곳의 변경과 충돌했다 — 최신 내용을 읽기 전에는 다시 보내지 않게 안내한다.
  const [renameStale, setRenameStale] = useState(false);
  const [post] = useState(createCommands);
  const enabled = !!organizationId && open;
  const teams = useQuery({ ...teamsOptions(organizationId), enabled });
  const members = useQuery({ ...membersOptions(organizationId, { startDate: dates.start, endDate: dates.end ?? dates.start }), enabled });
  const invitations = useQuery({ ...waitingInvitationsOptions(organizationId), enabled });
  const count = (values: (string | null | undefined)[] | undefined, teamId: string) => values ? String(values.filter((value) => value === teamId).length) : "-";
  const memberCount = (teamId: string) => count(members.data?.members.map((member) => member.team.teamId), teamId);
  const refresh = () => client.invalidateQueries({ queryKey: organizationKey(organizationId) });
  const list = () => { setEditing(undefined); setConfirming(false); };

  const save = async (name: string) => {
    if (editing) await renameTeam(organizationId, editing, name); else await createTeam(post, organizationId, name);
    await refresh();
  };
  const remove = useMutation({
    retry: false,
    mutationFn: async (team: ServerTeam) => { await deleteTeam(organizationId, team); await refresh(); },
    onSuccess: (_, team) => { list(); setNotice(`${team.teamName} 팀을 삭제했습니다`); },
  });
  // 충돌 뒤에는 목록을 다시 읽어 그 팀의 현재 이름과 version으로 폼을 다시 연다.
  const reload = useMutation({
    retry: false,
    mutationFn: async () => {
      const result = await teams.refetch();
      if (result.error) throw result.error;
      const latest = result.data?.find((team) => team.teamId === editing?.teamId);
      if (!latest) throw new Error("팀을 더 이상 찾을 수 없습니다. 목록으로 돌아가 확인하세요.");
      return latest;
    },
    onSuccess: (latest) => { remove.reset(); setConfirming(false); setEditing(latest); },
  });
  const busy = remove.isPending || reload.isPending;
  const reloadButton = <Button size="sm" loading={reload.isPending} loadingLabel="불러오는 중…" disabled={busy} onClick={() => { setRenameStale(false); reload.mutate(); }}>최신 내용 불러오기</Button>;

  return <>
    <Button onClick={() => { list(); setNotice(""); remove.reset(); reload.reset(); setRenameStale(false); setOpen(true); }} disabled={!organizationId}>팀 관리</Button>
    <DetailDrawer open={open} onClose={() => { if (!busy) setOpen(false); }} title="팀 관리" subtitle={teams.data ? `${teams.data.length}개 개발팀 · 사용량과 비용을 함께 볼 단위` : "사용량과 비용을 함께 볼 단위"}>
      <p className="mb-4 text-xs leading-5 text-text3">플랫폼팀, 프론트팀처럼 개발팀 내 프로젝트 그룹을 관리합니다. 새 팀은 사용량이 수집된 뒤 분석에 표시됩니다.</p>
      {notice && editing === undefined && <p role="status" className="mb-4 rounded-md bg-sub p-3 text-xs">{notice}</p>}
      {teams.isPending && enabled && <LoadingState message="팀 목록을 불러오는 중입니다…" />}
      {teams.error && <ErrorState message={teams.error.message} retrying={teams.isFetching} onRetry={() => void teams.refetch({ cancelRefetch: false })} />}
      {editing !== undefined ? <div className="flex flex-col gap-6">
        {/* version이 바뀌면 최신 이름으로 폼을 다시 만든다. */}
        <fieldset disabled={busy} className="min-w-0">
          <TeamForm key={editing ? `${editing.teamId}-${editing.version}` : "new"} team={editing} onCancel={list}
            onSave={async (name) => {
              setRenameStale(false);
              try { await save(name); } catch (error) { if (editing && stale(error)) setRenameStale(true); throw error; }
            }}
            onDone={(name) => { list(); setNotice(`${name} 팀을 저장했습니다`); }}
            recovery={renameStale ? <div className="flex justify-end">{reloadButton}</div> : undefined} />
        </fieldset>
        {reload.error && <ErrorState message={reload.error.message} />}
        {editing && <section aria-label="팀 삭제" className="flex flex-col gap-3 border-t border-border pt-5">
          <h3 className="text-sm font-semibold">팀 삭제</h3>
          <p className="text-xs leading-5 text-text3">팀을 삭제하면 현재 구성원 {memberCount(editing.teamId)}명이 미배정이 됩니다. 과거 사용 기록은 바뀌지 않습니다.</p>
          {remove.error && <ErrorState message={remove.error.message}>{stale(remove.error) && reloadButton}</ErrorState>}
          {confirming ? <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-red bg-red-tint px-3 py-2.5">
            <span className="flex-1 text-xs">{editing.teamName} 팀을 삭제합니다.</span>
            <Button size="sm" disabled={busy} onClick={() => setConfirming(false)}>되돌리기</Button>
            <Button size="sm" loading={remove.isPending} loadingLabel="삭제 중…" disabled={busy || stale(remove.error)} onClick={() => remove.mutate(editing)}>팀 삭제 확인</Button>
          </div> : <div><Button className="text-red" disabled={busy} onClick={() => { remove.reset(); setConfirming(true); }}>팀 삭제</Button></div>}
        </section>}
      </div> : teams.data && <>
        <div className="mb-4 flex justify-end"><Button variant="primary" onClick={() => { setNotice(""); setEditing(null); }}>팀 만들기</Button></div>
        {!teams.data.length && <p className="py-8 text-center text-sm text-text3">아직 팀이 없습니다. 첫 팀을 만들어 보세요.</p>}
        <ul aria-label="팀 목록" className="divide-y divide-border">
          {teams.data.map((team) => <li key={team.teamId}>
            <button type="button" onClick={() => { setNotice(""); remove.reset(); reload.reset(); setRenameStale(false); setConfirming(false); setEditing(team); }}
              className="flex w-full cursor-pointer items-center gap-3 py-4 text-left hover:bg-hover" aria-label={`${team.teamName} 팀 수정`}>
              <span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{team.teamName}</span>
                <span className="mt-1 block text-xs text-text3">구성원 {memberCount(team.teamId)}명 · 초대 {count(invitations.data?.map((invite) => invite.team?.teamId), team.teamId)}명</span></span>
              <span aria-hidden="true" className="text-text3">›</span>
            </button>
          </li>)}
        </ul>
      </>}
    </DetailDrawer>
  </>;
}
