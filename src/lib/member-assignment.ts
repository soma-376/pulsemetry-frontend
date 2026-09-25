import { buildMembers, type MembersModel } from "./metrics/members";
import type { OrganizationState } from "./organization";
import { memberAssignmentSchema } from "./schemas/member";

export type MemberAssignmentTarget = Pick<MembersModel["memberRows"][number], "account" | "invited" | "teamId" | "role">;

/** 팀 배정과 역할만 갱신합니다. 초대 만료일, 좌석 상태와 사용 기록은 유지합니다. */
export function saveMemberAssignment(
  state: OrganizationState,
  target: Pick<MemberAssignmentTarget, "account" | "invited">,
  input: unknown,
): OrganizationState {
  const values = memberAssignmentSchema.parse(input);
  if (values.team && !state.teams.some((team) => team.id === values.team)) {
    throw new Error("선택한 팀을 찾을 수 없습니다. 팀을 다시 선택하세요");
  }
  const email = target.account.trim().toLowerCase();
  if (target.invited) {
    if (!state.members.invites.some((invite) => invite.email.toLowerCase() === email)) {
      throw new Error("수정할 초대를 찾을 수 없습니다");
    }
    return { ...state, members: { ...state.members, invites: state.members.invites.map((invite) =>
      invite.email.toLowerCase() === email ? { ...invite, ...values } : invite,
    ) } };
  }
  const member = buildMembers(undefined, state.members, state.teams).memberRows.find((row) =>
    !row.invited && row.account.toLowerCase() === email,
  );
  if (!member) throw new Error("수정할 구성원을 찾을 수 없습니다");
  return {
    ...state,
    members: {
      ...state.members,
      assigned: { ...state.members.assigned, [member.account]: values.team },
      roles: { ...state.members.roles, [member.account]: values.role },
    },
  };
}
