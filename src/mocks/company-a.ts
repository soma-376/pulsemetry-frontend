import fixture from "./generated/company-a.json";
export { SEED_CATALOG } from "./catalog";
import type {
  ManagedVendor,
  OnboardingState,
  ServerTeam,
} from "@/lib/api/management";

/** 백엔드 dev-seed fixture 명령에서 생성한 고정 시나리오. 실제 API 실패의 대체값으로 사용하지 않는다. */
export const COMPANY_A = fixture;
export const COMPANY_A_VENDORS: ManagedVendor[] = fixture.managedVendors;
export const COMPANY_A_TEAMS: ServerTeam[] = fixture.teams;
export const COMPANY_A_ONBOARDING = fixture.onboarding as OnboardingState;
