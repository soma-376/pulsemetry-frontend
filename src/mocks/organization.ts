import type { OrganizationState } from "@/lib/organization";

export const SEED_TEAMS = ["플랫폼", "데이터", "결제", "프론트엔드", "모바일"].map((name, index) => ({
  id: `team-${index + 1}`, name, sourceName: name,
}));

export const INITIAL_ORGANIZATION: OrganizationState = {
  teams: SEED_TEAMS,
  members: { assigned: {}, invites: [] },
  seatReviewDays: 14,
  session: null,
  promptRaw: null,
  onboardingCompleted: false,
  onboardingStep: "collection",
  onboardingDraft: {
    contract: { kind: "copilot", plan: "copilot_business", tiers: [{ label: "표준", seats: "", fee: "" }], term: "" },
    teamName: "",
    invite: { draft: "", team: "", role: "member", invitees: [] },
  },
  vendorEdits: {},
  addedVendors: [],
};
