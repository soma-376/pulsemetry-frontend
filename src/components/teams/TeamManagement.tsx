"use client";

import { useMemo, useState } from "react";
import { TeamForm } from "./TeamForm";
import { Button } from "@/components/ui/Button";
import { DetailDrawer } from "@/components/ui/DetailDrawer";
import { useOrganization } from "@/lib/organization-store";
import { buildMembers } from "@/lib/metrics/members";

export function TeamManagement() {
  const { state } = useOrganization();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null | undefined>(undefined);
  const [notice, setNotice] = useState("");
  const model = useMemo(() => buildMembers(undefined, state.members, state.teams), [state.members, state.teams]);
  return <>
    <Button onClick={() => { setEditing(undefined); setNotice(""); setOpen(true); }}>팀 관리</Button>
    <DetailDrawer open={open} onClose={() => setOpen(false)} title="팀 관리" subtitle={`${state.teams.length}개 개발팀 · 사용량과 비용을 함께 볼 단위`}>
      <p className="mb-4 text-xs leading-5 text-text3">플랫폼팀, 프론트팀처럼 개발팀 내 프로젝트 그룹을 관리합니다. 새 팀은 사용량이 수집된 뒤 분석에 표시됩니다.</p>
      {notice && <p role="status" className="mb-4 rounded-md bg-sub p-3 text-xs">{notice}</p>}
      {editing !== undefined ? <TeamForm key={editing ?? "new"} team={state.teams.find((team) => team.id === editing) ?? null} onCancel={() => setEditing(undefined)} onDone={(name) => { setEditing(undefined); setNotice(`${name} 팀을 저장했습니다`); }} /> : <>
        <div className="mb-4 flex justify-end"><Button variant="primary" onClick={() => { setNotice(""); setEditing(null); }}>팀 만들기</Button></div>
        {!state.teams.length && <p className="py-8 text-center text-sm text-text3">아직 팀이 없습니다. 첫 팀을 만들어 보세요.</p>}
        <ul className="divide-y divide-border">
          {state.teams.map((team) => {
            const members = model.memberRows.filter((row) => row.team === team.name && !row.invited).length;
            const invites = state.members.invites.filter((invite) => invite.team === team.id).length;
            return <li key={team.id}><button type="button" onClick={() => { setNotice(""); setEditing(team.id); }} className="flex w-full cursor-pointer items-center gap-3 py-4 text-left hover:bg-hover" aria-label={`${team.name} 팀 수정`}>
              <span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{team.name}</span><span className="mt-1 block text-xs text-text3">구성원 {members}명 · 초대 {invites}명</span></span><span aria-hidden="true" className="text-text3">›</span>
            </button></li>;
          })}
        </ul>
      </>}
    </DetailDrawer>
  </>;
}
