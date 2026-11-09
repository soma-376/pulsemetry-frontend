import { dayCount, type DateRange } from "@/lib/date";
import { ACTIVITY } from "@/mocks/activity";
import type { VendorUsage } from "@/types/domain";

export { comparisonRange } from "@/lib/filter-query";

export function aggregateActivity(
  range: DateRange,
  source: typeof ACTIVITY = ACTIVITY,
) {
  const days = source.filter(
    (day) => day.date >= range.start && day.date <= (range.end ?? range.start),
  );
  const names = [
    ...new Set(source.flatMap((day) => day.teams.map((team) => team.team))),
  ];
  const teams = names.map((name) => {
    const records = days.flatMap((day) =>
      day.teams.filter((team) => team.team === name),
    );
    const models: Record<string, number> = {};
    const vendors = new Map<string | null, VendorUsage>();
    for (const record of records) {
      for (const model of record.models)
        models[model.key] = (models[model.key] ?? 0) + model.cost;
      for (const vendor of record.vendors) {
        const total = vendors.get(vendor.vendorId) ?? {
          vendorId: vendor.vendorId,
          cost: 0,
          tokensM: 0,
          sessions: 0,
        };
        vendors.set(vendor.vendorId, {
          vendorId: vendor.vendorId,
          cost: total.cost + vendor.cost,
          tokensM: total.tokensM + vendor.tokensM,
          sessions: total.sessions + vendor.sessions,
        });
      }
    }
    return {
      team: name,
      users: new Set(records.flatMap((record) => record.users)).size,
      cost: records.reduce((sum, record) => sum + record.cost, 0),
      sessions: records.reduce((sum, record) => sum + record.sessions, 0),
      tokensM: records.reduce((sum, record) => sum + record.tokensM, 0),
      models,
      vendors: [...vendors.values()],
    };
  });
  return {
    days,
    complete: days.length === dayCount(range),
    teams,
    cost: teams.reduce((sum, team) => sum + team.cost, 0),
    users: teams.reduce((sum, team) => sum + team.users, 0),
    sessions: teams.reduce((sum, team) => sum + team.sessions, 0),
    tokensM: teams.reduce((sum, team) => sum + team.tokensM, 0),
  };
}
