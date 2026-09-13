import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Requires VITE_API_MODE=real npm run build. HTTP stubs verify the built client;
// this is not a live backend integration test. A separate temporary port is used.
const out = new URL('../docs/validation/phase-8/real-api/', import.meta.url);
await mkdir(out, { recursive: true });
const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const entry = html.match(/src="([^" ]+\.js)"/)[1];
const source = await readFile(new URL('../dist' + entry, import.meta.url), 'utf8');
expect(source).not.toContain('X-Mock-Case');
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '4174',
    '--strictPort',
  ],
  {
    cwd: new URL('..', import.meta.url),
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let log = '',
  browser;
server.stdout.on('data', (c) => {
  log += c;
});
server.stderr.on('data', (c) => {
  log += c;
});
const checks = [],
  calls = [],
  errors = [];
try {
  await expect.poll(() => log, { timeout: 10000 }).toContain('127.0.0.1:4174');
  browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  let fail = true;
  await page.route('**/v1/**', async (route) => {
    const r = route.request(),
      path = new URL(r.url()).pathname;
    calls.push({ path, method: r.method(), mockHeader: r.headers()['x-mock-case'] });
    const json = (data, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (path === '/v1/auth/login')
      return json({ access_token: 'stub-session', token_type: 'Bearer', expires_in: 3600 });
    expect(r.headers().authorization).toBe('Bearer stub-session');
    if (path === '/v1/me')
      return json({
        member_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        email: 'contract@example.test',
        role: 'owner',
        accessible_team_ids: [],
        tenant: {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          name: 'Contract test',
          timezone: 'Asia/Seoul',
        },
      });
    if (path === '/v1/meta/filters')
      return json({ teams: [], products: ['claude_code', 'codex'], models: [] });
    if (path === '/v1/query')
      return json(
        { error: 'unavailable', message: 'Contract test unavailable', request_id: 'stub-503' },
        503,
      );
    if (path === '/v1/saved-reports') return json({ items: [] });
    if (path === '/v1/scenario-runs')
      return json({ error: 'unauthorized', message: 'Session expired' }, 401);
    if (path === '/v1/scenarios')
      return fail
        ? json(
            {
              error: 'unavailable',
              message: 'Contract catalog unavailable',
              request_id: 'stub-catalog',
            },
            503,
          )
        : json({ items: [], categories: [] });
    errors.push(`Unexpected API path: ${path}`);
    return json({ error: 'unexpected_path', message: path }, 500);
  });
  await page.goto('http://127.0.0.1:4174/scenarios');
  await expect(page.getByRole('button', { name: 'owner 계정 입력' })).toHaveCount(0);
  await page.getByLabel('이메일', { exact: true }).fill('contract@example.test');
  await page.getByLabel('비밀번호', { exact: true }).fill('stub-only');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.locator('#page-content')).toBeVisible();
  await expect.poll(() => calls.some((c) => c.path === '/v1/scenarios')).toBe(true);
  await expect(page.getByText('Contract catalog unavailable')).toBeVisible();
  await expect(page.locator('[data-availability]')).toHaveCount(0);
  checks.push(
    'Real build login uses HTTP Bearer; HTTP 503 remains an error without fixture fallback',
  );
  expect(
    await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length)),
  ).toBe(0);
  expect(calls.every((c) => c.mockHeader === undefined)).toBe(true);
  checks.push('No MSW registration or mock request header in real build');
  fail = false;
  await page.getByRole('button', { name: '카탈로그 재시도', exact: true }).click();
  await expect(page.getByText('등록된 시나리오가 없습니다.')).toBeVisible();
  await expect(page.locator('[data-availability]')).toHaveCount(0);
  checks.push('Explicit retry recovers to the server empty catalog');
  await page.getByRole('link', { name: '이력 · 저장된 리포트', exact: true }).click();
  await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
  checks.push('HTTP 401 returns to login and removes protected content');
  expect(errors).toEqual([]);
  await writeFile(new URL('results.json', out), JSON.stringify({ checks, calls, errors }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, errors }));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
