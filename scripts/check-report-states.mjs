import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = new URL('../docs/validation/phase-7/states/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const errors = [],
  checks = [];
const base = {
  status: 'succeeded',
  scenario_id: 'S1-3',
  params: { from: 'now-28d', to: 'now', moving_avg_days: 7, spike_threshold_pct: 200 },
  params_summary: '28d · 테스트',
  resolved_from: '2026-08-10T00:00:00Z',
  resolved_to: '2026-09-07T00:00:00Z',
  created_at: '2026-09-07T10:00:00Z',
  created_by: { member_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', display_name: '조직 관리자' },
  result: {
    target_page: 'P1',
    applied_filters: { from: 'now-28d', to: 'now', team_ids: [] },
    highlight_widgets: ['W1.2'],
    findings: [],
    frames: {},
  },
};
const result = (metric, values, config = {}, status = 200) => ({
  status,
  frames: [
    {
      schema: {
        ref_id: metric,
        metric_id: metric,
        frame_type: 'scalar',
        fields: [{ name: 'value', type: 'number', config }],
      },
      data: { values: [values] },
    },
  ],
});
const fixtures = Array.from({ length: 12 }, (_, i) => ({
  run: { ...base, run_id: 'fixture-' + i },
  actor: 'owner',
  started: 0,
  mode: 'normal',
  input: { params: base.params },
}));
fixtures[11].run.result = {
  ...base.result,
  findings: [
    {
      rule_id: 'sensitive',
      severity: 'warning',
      title: 'PRIVATE_FINDING_984231',
      evidence: { metric_id: 'cost', value: 984231 },
      widget_id: 'W1.2',
    },
  ],
  frames: {
    cost: result('cost', [984231], { suppressed: true }),
    tokens: result('tokens', [0]),
    active_users: result('active_users', [null]),
    sessions: {
      status: 504,
      frames: [],
      error: { message: '부분 지표 시간 초과', request_id: 'fixture-partial' },
    },
  },
};
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(
  (db) => {
    if (!localStorage.getItem('pulsemetry.test-seeded')) {
      localStorage.setItem('pulsemetry.mock.scenario-db.v7', JSON.stringify(db));
      localStorage.setItem('pulsemetry.test-seeded', '1');
    }
  },
  { runs: fixtures, saved: [] },
);
const login = async (role) => {
  await page.getByRole('button', { name: role + ' 계정 입력' }).click();
  await page.getByRole('button', { name: '로그인', exact: true }).click();
};
const shot = async (name) =>
  page.screenshot({ path: new URL(name + '.png', out).pathname, fullPage: true });
try {
  await page.goto('http://127.0.0.1:5173/runs/fixture-11');
  await login('owner');
  await expect(page.getByRole('heading', { name: '판정 · findings' })).toBeVisible();
  await expect(page.getByText('부분 지표 시간 초과', { exact: false })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('984231');
  await expect(page.locator('[data-result-metric="tokens"] strong')).toHaveText('0');
  await expect(page.locator('[data-result-metric="active_users"] strong')).toHaveText('미관측');
  await shot('partial-masked-zero-null');
  checks.push(
    'partial errors preserve successful refs; masked payload and finding hidden; zero/null distinct',
  );
  await page.getByRole('button', { name: '저장', exact: true }).click();
  const dialog = page.getByRole('dialog');
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    if (!(await dialog.evaluate((el) => el.contains(document.activeElement))))
      throw new Error('focus escaped dialog');
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '저장', exact: true })).toBeFocused();
  checks.push('save dialog Tab trap and Escape focus restoration');
  await page.getByRole('link', { name: '시나리오', exact: true }).click();
  await page.getByRole('link', { name: '이력 · 저장된 리포트', exact: true }).click();
  const history = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: /^실행 이력/ }) });
  await expect(history.locator('tbody tr')).toHaveCount(10);
  await history.getByRole('button', { name: '다음', exact: true }).click();
  await expect(history.locator('tbody tr')).toHaveCount(2);
  await history.getByRole('button', { name: '이전', exact: true }).click();
  await expect(history.locator('tbody tr')).toHaveCount(10);
  await shot('pagination');
  checks.push('opaque next cursor and previous page with 12 server runs');
  await page.evaluate(() => sessionStorage.setItem('pulsemetry.mockCase', 'error'));
  await history.getByRole('button', { name: '이력 새로고침' }).click();
  await expect(history.getByRole('alert')).toBeVisible();
  await shot('history-error');
  await page.evaluate(() => sessionStorage.setItem('pulsemetry.mockCase', 'normal'));
  await history.getByRole('button', { name: '이력 재시도' }).click();
  await expect(history.locator('tbody tr')).toHaveCount(10);
  checks.push('history network error and explicit retry');
  await page.getByRole('button', { name: '로그아웃' }).click();
  await login('admin');
  await page.getByRole('link', { name: '시나리오', exact: true }).click();
  await page.getByRole('link', { name: '이력 · 저장된 리포트', exact: true }).click();
  await expect(page.getByText('실행 이력이 없습니다.', { exact: true })).toBeVisible();
  await shot('admin-empty');
  checks.push('logout clears memory and admin cannot list owner org runs');
  // A deliberately over-broad server response must also be blocked at the result-view boundary.
  await page.evaluate((run) => {
    const fetch = window.fetch;
    window.fetch = (input, init) =>
      String(typeof input === 'string' ? input : input.url).includes('/scenario-runs/fixture-11')
        ? Promise.resolve(
            new Response(JSON.stringify(run), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          )
        : fetch(input, init);
  }, fixtures[11].run);
  await page.evaluate(() => {
    history.pushState({}, '', '/runs/fixture-11');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { name: '접근 권한이 없습니다' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('984231');
  checks.push('admin result guard rejects over-broad server snapshot before rendering');
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(new URL('results.json', out), JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, errors }));
} finally {
  await browser.close();
}
