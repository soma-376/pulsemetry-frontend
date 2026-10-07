import type { InviteForm } from "./schemas/invite";
import { collectionSchema, type OnboardingStep } from "./schemas/onboarding";
import type { VendorDraft, VendorEdits } from "./settings";
import type { VendorRecord } from "@/mocks/vendors";

export { INITIAL_ORGANIZATION, SEED_TEAMS } from "@/mocks/organization";
export type Team = { id: string; name: string; sourceName: string | null };
export type OrganizationState = {
  seatReviewDays: number;
  session: { email: string; name: string; organizationId: string } | null;
  promptRaw: boolean | null;
  onboardingCompleted: boolean;
  onboardingStep: OnboardingStep;
  onboardingDraft: {
    contract: VendorDraft;
    teamName: string;
    invite: InviteForm;
  };
  vendorEdits: VendorEdits;
  addedVendors: VendorRecord[];
};

export function teamLabel(teams: Team[], idOrSourceName: string) {
  return (
    teams.find(
      (team) =>
        team.id === idOrSourceName || team.sourceName === idOrSourceName,
    )?.name ?? idOrSourceName
  );
}

export function hasSavedContract(state: OrganizationState) {
  return (
    state.addedVendors.length > 0 ||
    Object.values(state.vendorEdits).some(
      (edit) => edit?.confirmed && !edit.cleared,
    )
  );
}

export function completeOnboarding(
  state: OrganizationState,
): OrganizationState {
  if (
    !state.session ||
    !collectionSchema.safeParse({ promptRaw: state.promptRaw }).success ||
    !hasSavedContract(state)
  ) {
    return state;
  }
  return { ...state, onboardingCompleted: true };
}
