"use client";

import { useMemo, useState } from "react";
import { TeamForm } from "@/components/teams/TeamForm";
import { InviteForm } from "@/components/members/InviteForm";
import { PendingInviteCard } from "@/components/members/PendingInviteCard";
import { useInvitations } from "@/lib/invitations";
import { buildMembers } from "@/lib/metrics/members";
import { useOrganization } from "@/lib/organization-store";
import { removeOnboardingTeam } from "@/lib/organization";

export function TeamSetupStep() {
  const { state, update } = useOrganization();
  const [notice, setNotice] = useState("");
  const invitations = useInvitations();
  const model = useMemo(
    () => buildMembers(undefined, state.members, state.teams),
    [state.members, state.teams],
  );
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm leading-6 text-text2">
        조직 내 프로젝트 그룹을 구성하고 함께할 구성원에게 초대 메일을 보내세요.
        팀 구성과 초대는 나중에 구성원 화면에서 진행해도 됩니다.
      </p>
      <section className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold">
          현재 팀 · {state.teams.length}개
        </h3>
        <ul aria-label="온보딩 팀 목록" className="mb-5 flex flex-wrap gap-2">
          {state.teams.map((team) => (
            <li
              key={team.id}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-sub py-0.5 pr-0.5 pl-2 text-xs text-text2"
            >
              <span className="min-w-0 break-words">{team.name}</span>
              <button
                type="button"
                aria-label={`${team.name} 팀 제거`}
                onClick={() => {
                  update((previous) => removeOnboardingTeam(previous, team.id));
                  setNotice(
                    `${team.name} 팀을 목록에서 제거했습니다. 해당 팀으로 지정한 초대는 팀 미배정으로 변경됩니다.`,
                  );
                }}
                className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-base text-text3 hover:bg-hover hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
        {state.teams.length === 0 && (
          <p className="mb-5 text-xs text-text3">
            선택한 팀이 없습니다. 아래에서 새 팀을 만들거나 건너뛸 수 있습니다.
          </p>
        )}
        <TeamForm
          team={null}
          persistDraft
          onDone={(name) => setNotice(`${name} 팀을 만들었습니다`)}
        />
        <p role="status" className="mt-2 text-xs text-text2">
          {notice}
        </p>
      </section>
      <section
        aria-label="구성원 초대"
        className="rounded-lg border border-border bg-card p-5"
      >
        <h3 className="mb-2 text-sm font-semibold">초대 메일 발송</h3>
        <p className="mb-5 text-xs leading-5 text-text2">
          초대할 이메일을 추가하고 팀을 선택한 뒤 발송하세요.
        </p>
        <InviteForm
          inline
          seatStatus={model.seatStatus}
          onInvite={invitations.send}
        />
      </section>
      {model.inviteRows.length > 0 && (
        <PendingInviteCard
          model={model}
          onResend={invitations.resend}
          onRevoke={invitations.revoke}
        />
      )}
    </div>
  );
}
