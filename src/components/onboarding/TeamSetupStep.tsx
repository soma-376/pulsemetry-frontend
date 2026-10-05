"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { TeamForm } from "@/components/teams/TeamForm";
import { InviteForm } from "@/components/members/InviteForm";
import { Button } from "@/components/ui/Button";
import { issueInvitations } from "@/lib/api/invitations";
import { organizationKey } from "@/lib/api/query-keys";
import { apiJson, createCommands, readOptions, orgPath, teamSchema, teamsOptions, type ServerTeam } from "@/lib/api/management";

export function TeamSetupStep({ organizationId, onBusy, draft, onDraftChange }: { draft: string; onDraftChange: (value: string) => void; organizationId: string; onBusy: (busy: boolean) => void }) {
  const client = useQueryClient();
  const teams = useQuery(teamsOptions(organizationId));
  const [post] = useState(createCommands);
  const [notice, setNotice] = useState("");
  const refresh = () => client.invalidateQueries({ queryKey: organizationKey(organizationId) });
  const create = useMutation({ retry: readOptions.retry, retryDelay: readOptions.retryDelay, mutationFn: (name: string) => post(organizationId, "/teams", { teamName: name }, teamSchema), onMutate: () => onBusy(true), onSuccess: refresh, onSettled: () => onBusy(false) });
  const remove = useMutation({ retry: readOptions.retry, retryDelay: readOptions.retryDelay, mutationFn: (team: ServerTeam) => apiJson("enrollment", orgPath(organizationId, `/teams/${encodeURIComponent(team.teamId)}`), z.undefined(), { method: "DELETE", headers: { "If-Match": `"team-${team.version}"` } }),
    onMutate: () => onBusy(true), onSuccess: async () => { setNotice("팀을 삭제했습니다."); await refresh(); }, onError: refresh, onSettled: () => onBusy(false),
  });
  return <div className="flex flex-col gap-5">
    <p className="text-sm leading-6 text-text2">조직 내 프로젝트 그룹을 구성하세요. 팀 구성은 나중에 진행해도 됩니다.</p>
    <section className="rounded-lg border border-border bg-card p-5">
      <h3 className="mb-4 text-sm font-semibold">현재 팀 · {teams.data?.length ?? "-"}개</h3>
      {teams.isPending && <p role="status" className="text-xs">팀을 불러오는 중입니다…</p>}
      {(teams.error || remove.error) && <div role="alert" className="text-xs text-red">{(teams.error ?? remove.error)?.message}<Button size="sm" onClick={() => void teams.refetch()}>다시 조회</Button></div>}
      {(teams.data?.length ?? 0) > 0 && <ul aria-label="온보딩 팀 목록" className="mb-5 flex flex-wrap gap-2">{teams.data?.map(team => <li key={team.teamId} className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-sub py-0.5 pr-0.5 pl-2 text-xs text-text2">
        <span className="min-w-0 break-words">{team.teamName}</span><button type="button" disabled={remove.isPending || create.isPending} aria-label={`${team.teamName} 팀 제거`} onClick={() => remove.mutate(team)} className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-base text-text3 hover:bg-hover hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"><span aria-hidden="true">×</span></button>
      </li>)}</ul>}
      {teams.data?.length === 0 && <p className="mb-5 text-xs text-text3">선택한 팀이 없습니다. 아래에서 새 팀을 만들거나 건너뛸 수 있습니다.</p>}
      <fieldset disabled={remove.isPending || teams.isPending || teams.isError}><TeamForm team={null} draftName={draft} onDraftChange={onDraftChange} onSave={async name => { await create.mutateAsync(name); }} onDone={name => setNotice(`${name} 팀을 만들었습니다`)} /></fieldset>
      <p role="status" className="mt-2 text-xs text-text2">{notice}</p>
    </section>
    <section aria-label="구성원 초대" className="rounded-lg border border-border bg-card p-5">
      <h3 className="mb-2 text-sm font-semibold">구성원 초대</h3>
      <p className="mb-5 text-xs leading-5 text-text2">초대는 건너뛸 수 있습니다. 초대한 사람과 메일 발송 상태는 온보딩 뒤 구성원 화면의 초대 대기에서 확인합니다.</p>
      {/* 구성원 화면과 같은 명령이다. 서버가 발급을 확정한 결과만 보여 준다. */}
      <InviteForm organizationId={organizationId} inline teams={teams.data} onInvite={async (entries) => {
        onBusy(true);
        try {
          const results = await issueInvitations(post, organizationId, entries);
          await refresh();
          return results;
        } finally { onBusy(false); }
      }} />
    </section>
  </div>;
}
