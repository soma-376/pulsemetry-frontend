import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

// Each suite owns a fresh browser context; preserve earlier phase artifacts.
const suites = process.argv.slice(2);
if (!suites.length)
  suites.push(
    'browser',
    'shell',
    'teams',
    'team-details',
    'overview',
    'operations',
    'scenarios',
    'scenario-states',
    'reports',
    'report-states',
    'accessibility',
  );
const root = new URL('../docs/validation/phase-8/', import.meta.url);
await mkdir(root, { recursive: true });
const results = [];
for (const suite of suites) {
  if (!/^[a-z-]+$/.test(suite)) throw new Error('Invalid suite name');
  const started = Date.now();
  let output = '';
  const code = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [new URL(`check-${suite}.mjs`, import.meta.url).pathname],
      {
        env: { ...process.env, VALIDATION_DIR: `phase-8/${suite}` },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', reject);
    child.on('close', resolve);
  });
  await writeFile(new URL(`${suite}.log`, root), output);
  results.push({ suite, code, seconds: Math.round((Date.now() - started) / 1000) });
  console.log(`${suite}: ${code === 0 ? 'PASS' : 'FAIL'} (${results.at(-1).seconds}s)`);
}
await writeFile(new URL('suite-results.json', root), JSON.stringify(results, null, 2) + '\n');
if (results.some((r) => r.code !== 0)) process.exitCode = 1;
