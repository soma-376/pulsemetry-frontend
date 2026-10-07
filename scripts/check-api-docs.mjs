import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const dir = path.resolve("docs/api");
const names = ["overview-api.md", "README.md", "teams-api.md", "members-api.md", "settings-api.md"];
const specs = names.map((name) => fs.readFileSync(path.join(dir, name), "utf8"));
const types = specs.flatMap((text) => [...text.matchAll(/```ts\r?\n([\s\S]*?)```/g)].map((m) => m[1])).join("\n");
const examples = [
  ["overview", "OverviewResponse"], ["teams", "TeamsResponse"],
  ["team-users", "TeamUsersResponse"], ["members", "MembersResponse"], ["settings", "SettingsResponse"],
];
const data = Object.fromEntries(examples.map(([name]) => [name, JSON.parse(fs.readFileSync(path.join(dir, name + "-response.example.json"), "utf8"))]));
const source = "export {};\n" + types + "\n" + examples.map(([name, type], i) => "const example" + i + ": " + type + " = " + JSON.stringify(data[name]) + ";").join("\n");
const virtualPath = path.join(dir, "__contract_check__.ts");
const opts = { strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, types: [] };
const host = ts.createCompilerHost(opts);
const baseGet = host.getSourceFile.bind(host);
host.getSourceFile = (name, languageVersion, onError, shouldCreateNewSourceFile) =>
  path.resolve(name) === virtualPath
    ? ts.createSourceFile(name, source, languageVersion, true)
    : baseGet(name, languageVersion, onError, shouldCreateNewSourceFile);
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([virtualPath], opts, host));
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => process.cwd(), getCanonicalFileName: (s) => s, getNewLine: () => "\n",
  }));
  process.exit(1);
}
for (let i = 0; i < specs.length; i++) {
  for (const match of specs[i].matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].split("#")[0];
    if (target && !target.includes("://")) assert.ok(fs.existsSync(path.resolve(dir, target)), names[i] + ": missing link " + target);
  }
}
const sum = (rows, key) => rows.reduce((n, row) => n + Number(row[key]), 0);
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.000001, a + " != " + b);
const overview = data.overview;
const teams = data.teams;
const rows = [...teams.teams.items, teams.unassigned];
near(sum(rows.map((r) => r.current), "equivalentCostUsd"), Number(overview.usage.current.equivalentCostUsd));
for (const row of rows) {
  near(sum(row.trend, "equivalentCostUsd"), Number(row.current.equivalentCostUsd));
  near(sum(row.trend, "totalTokens"), row.current.tokens.total);
  near(sum(row.modelMix.data.models, "equivalentCostUsd"), Number(row.current.equivalentCostUsd));
  near(sum(row.modelMix.data.models, "totalTokens"), row.current.tokens.total);
  assert.equal(row.trend.at(-1).cumulativeSessionCount, row.current.sessionCount);
}
for (const model of teams.modelScatter.data.models) {
  near(rows.reduce((n, row) => n + Number(row.modelMix.data.models.find((m) => m.modelId === model.modelId).equivalentCostUsd), 0), Number(model.equivalentCostUsd));
}
const members = data.members;
assert.equal(members.summary.rosterMembers, members.members.totalCount);
assert.equal(members.summary.seats.data.contracted, members.summary.seats.data.assigned + members.summary.seats.data.unallocated);
const settings = data.settings;
const rollout = settings.policyRollout;
assert.equal(rollout.eligibleInstallations, rollout.appliedInstallations + rollout.outdatedInstallations + rollout.unknownInstallations);
for (const vendor of settings.vendors.items) {
  if (vendor.contract) near(vendor.contract.tiers.reduce((n, tier) => n + tier.seats * Number(tier.monthlyFeePerSeatUsd), 0), Number(vendor.contract.monthlySeatFeeUsd));
}
console.log("API docs: 5 examples type-check; local links and aggregation invariants pass.");
