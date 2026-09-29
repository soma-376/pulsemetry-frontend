import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, "src/mocks/generated/company-a.json");
const args = process.argv.slice(2);
const date = args.find(arg => arg !== "--check") ?? "2026-09-28";
if (args.some(arg => arg !== date && arg !== "--check") || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  throw new Error("Usage: npm run fixtures:sync -- [YYYY-MM-DD] [--check]");
}
// fixture는 DB 연결 전에 반환한다. --no-deps로 서버/DB를 시작하지 않는다.
const result = spawnSync("docker", ["compose", "run", "--rm", "--no-deps", "-T", "dev-seed", "fixture", date, "A"], {
  cwd: resolve(root, "../pulsemetry-backend"), encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(result.stderr || "dev-seed fixture failed");
const data = JSON.parse(result.stdout);
if (data.fixtureVersion !== 1 || data.asOf !== date || !data.synthetic || !data.catalog || !data.managedVendors) {
  throw new Error("Unexpected fixture format. Rebuild the dev-seed image first.");
}
// 공개 데이터 allowlist는 Kotlin exporter가 소유한다. 저장 직전 민감 필드도 방어적으로 확인한다.
if (/password|code_hash|invitation_codes|access_token|refresh_token/i.test(JSON.stringify(data))) {
  throw new Error("Fixture contains credential fields");
}
const { catalog, ...company } = data;
for (const [path, value] of [[target, company], [resolve(root, "src/mocks/generated/vendor-catalog.json"), catalog]]) {
  const output = `${JSON.stringify(value, null, 2)}\n`;
  if (args.includes("--check")) {
    if (readFileSync(path, "utf8") !== output) throw new Error("Seed fixture differs. Run npm run fixtures:sync.");
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, output, "utf8");
  }
}
console.log(args.includes("--check") ? "A fixture and catalog match backend" : `Updated A fixture and catalog (${date}); database unchanged`);
