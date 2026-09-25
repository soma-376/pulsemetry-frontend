import type { Team } from "@/lib/organization";
import type { aggregateActivity } from "./activity";
import type { VendorUsage } from "@/types/domain";

type ActivityTeam = ReturnType<typeof aggregateActivity>["teams"][number];
const emptyTeam = (team: string): ActivityTeam => ({ team, users: 0, cost: 0, sessions: 0, tokensM: 0, models: {}, vendors: [] });
const matches = (team: Team, source: string) => team.id === source || team.sourceName === source;

/** Registered teams remain visible even with no observations. Orphaned attribution stays explicit. */
export function overviewTeams(teams: ActivityTeam[], catalog: Team[]) {
  const registered = catalog.map((team) => ({ ...(teams.find((item) => matches(team, item.team)) ?? emptyTeam(team.id)), team: team.id }));
  const unmapped = emptyTeam("미배정");
  const vendors = new Map<string | null, VendorUsage>();
  for (const source of teams.filter((item) => !catalog.some((team) => matches(team, item.team)))) {
    unmapped.users += source.users;
    unmapped.cost += source.cost;
    unmapped.sessions += source.sessions;
    unmapped.tokensM += source.tokensM;
    for (const [id, cost] of Object.entries(source.models)) unmapped.models[id] = (unmapped.models[id] ?? 0) + cost;
    for (const vendor of source.vendors) {
      const previous = vendors.get(vendor.vendorId) ?? { vendorId: vendor.vendorId, cost: 0, sessions: 0, tokensM: 0 };
      vendors.set(vendor.vendorId, { vendorId: vendor.vendorId, cost: previous.cost + vendor.cost, sessions: previous.sessions + vendor.sessions, tokensM: previous.tokensM + vendor.tokensM });
    }
  }
  unmapped.vendors = [...vendors.values()];
  return { registered, unmapped };
}
