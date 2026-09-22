"use client";

import { useOrganization } from "./organization-store";
import { TODAY, toIso } from "./date";

/** 실제 메일 전송을 대신하는 프론트 목 처리. 온보딩과 구성원 화면이 같은 초대 목록을 사용합니다. */
export function useInvitations() {
  const { update } = useOrganization();
  const send = (entries: { email: string; team: string; role: string }[]) => update((previous) => ({
    ...previous,
    members: { ...previous.members, invites: [
      ...previous.members.invites.filter((invite) => !entries.some((entry) => entry.email === invite.email)),
      ...entries.map((entry) => ({ ...entry, invitedAt: toIso(TODAY) })),
    ] },
  }));
  const resend = async (email: string) => {
    // 목 요청 지연으로 재발송 처리 상태를 확인할 수 있게 합니다.
    await new Promise((resolve) => setTimeout(resolve, 500));
    update((previous) => ({
      ...previous,
      members: { ...previous.members, invites: previous.members.invites.map((invite) => invite.email === email ? { ...invite, invitedAt: toIso(TODAY) } : invite) },
    }));
  };
  const revoke = (email: string) => update((previous) => ({
    ...previous,
    members: { ...previous.members, invites: previous.members.invites.filter((invite) => invite.email !== email) },
  }));
  return { send, resend, revoke };
}
