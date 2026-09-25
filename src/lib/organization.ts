import { teamFormSchema } from "./schemas/team";
import type { InviteForm } from "./schemas/invite";
import { collectionSchema, type OnboardingStep } from "./schemas/onboarding";
import type { VendorDraft, VendorEdits } from "./settings";
import type { VendorRecord } from "@/mocks/vendors";
import type { MemberState } from "./metrics/members";

export { INITIAL_ORGANIZATION, SEED_TEAMS } from "@/mocks/organization";
export type Team = { id: string; name: string; sourceName: string | null };
export type OrganizationState = {
  teams: Team[];
  members: MemberState;
  seatReviewDays: number;
  session: { email: string; name: string; organizationId: string } | null;
  promptRaw: boolean | null;
  onboardingCompleted: boolean;
  onboardingStep: OnboardingStep;
  onboardingDraft: { contract: VendorDraft; teamName: string; invite: InviteForm };
  vendorEdits: VendorEdits;
  addedVendors: VendorRecord[];
};

export function teamLabel(teams: Team[], idOrSourceName: string) {
  return teams.find((team) => team.id === idOrSourceName || team.sourceName === idOrSourceName)?.name ?? idOrSourceName;
}

/** IDs, membership and recorded usage identifiers survive a display-name change. */
export function saveTeam(state: OrganizationState, input: unknown, id: string, editing: boolean): OrganizationState {
  const { name } = teamFormSchema.parse(input);
  if (editing && !state.teams.some((team) => team.id === id)) throw new Error("수정할 팀을 찾을 수 없습니다");
  if (!editing && state.teams.some((team) => team.id === id)) throw new Error("이미 존재하는 팀입니다");
  if (state.teams.some((team) => team.id !== id && team.name.normalize("NFKC").toLocaleLowerCase() === name.normalize("NFKC").toLocaleLowerCase())) {
    throw new Error("같은 이름의 팀이 이미 있습니다");
  }
  return { ...state, teams: editing
    ? state.teams.map((team) => team.id === id ? { ...team, name } : team)
    : [...state.teams, { id, name, sourceName: null }] };
}

/** 온보딩에서 구성 중인 팀을 제외합니다. 사람은 남기고 팀 배정만 해제합니다. */
export function removeOnboardingTeam(state: OrganizationState, id: string): OrganizationState {
  const team = state.teams.find((item) => item.id === id);
  if (!team || state.onboardingCompleted) return state;
  const unassign = (value: string) => value === id || value === team.sourceName ? "" : value;
  return {
    ...state,
    teams: state.teams.filter((item) => item.id !== id),
    members: {
      ...state.members,
      assigned: Object.fromEntries(Object.entries(state.members.assigned).map(([email, teamId]) => [email, unassign(teamId)])),
      invites: state.members.invites.map((invite) => ({ ...invite, team: unassign(invite.team) })),
    },
    onboardingDraft: {
      ...state.onboardingDraft,
      invite: {
        ...state.onboardingDraft.invite,
        team: unassign(state.onboardingDraft.invite.team),
        invitees: state.onboardingDraft.invite.invitees.map((invitee) => ({ ...invitee, team: invitee.team === null ? null : unassign(invitee.team) })),
      },
    },
  };
}

export function hasSavedContract(state: OrganizationState) {
  return state.addedVendors.length > 0 || Object.values(state.vendorEdits).some((edit) => edit?.confirmed && !edit.cleared);
}

export function completeOnboarding(state: OrganizationState): OrganizationState {
  if (!state.session || !collectionSchema.safeParse({ promptRaw: state.promptRaw }).success || !hasSavedContract(state)) {
    return state;
  }
  return { ...state, onboardingCompleted: true };
}
