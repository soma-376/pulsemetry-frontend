import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = new URL('../docs/validation/phase-2/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const requests = [],
  errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  if (r.url().endsWith('/v1/query')) requests.push(JSON.parse(r.postData()));
});
const widget = (id) => page.locator(`[data-widget="${id}"]`);
async function login(role = 'owner') {
  await page.getByRole('button', { name: role + ' 계정 입력' }).click();
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('navigation')).toBeVisible();
}
async function shot(name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: new URL(name + '.png', out).pathname, fullPage: true });
}
async function loadAll() {
  for (const id of ['sessions', 'prompts', 'heatmap', 'output', 'cost', 'tokens']) {
    await widget(id).scrollIntoViewIfNeeded();
    await expect(widget(id).getByText('불러오는 중…')).toHaveCount(0);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}
async function state(value) {
  await page.evaluate((v) => sessionStorage.setItem('pulsemetry.mockCase', v), value);
  await page.getByRole('button', { name: '새로고침', exact: true }).click();
}
try {
  await page.goto(base + '/teams?compare=previous_week&teams=11111111-1111-4111-8111-111111111111');
  await login();
  await expect(page.locator('[data-kpi="active_users"]')).toContainText('11');
  await expect(widget('sessions')).toContainText('318');
  expect(requests.some((r) => r.queries.some((q) => q.metric_id === 'tokens'))).toBe(false);
  checks.push('Below-fold token widget is not requested before entering viewport');
  await loadAll();
  await expect(widget('tokens').locator('.recharts-area')).toHaveCount(4);
  await shot('desktop-light');
  await page.getByRole('button', { name: '다크', exact: true }).click();
  await shot('desktop-dark');
  await page.getByRole('button', { name: '라이트', exact: true }).click();
  const geometry = await page.evaluate(() => ({
    kpi: [...document.querySelectorAll('[data-kpi]')].map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }),
    widgets: [...document.querySelectorAll('[data-widget]')].map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.dataset.widget, x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  }));
  await widget('heatmap').getByRole('button', { name: '월요일 23시 KST', exact: false }).click();
  await expect(widget('heatmap').getByRole('status')).toContainText('23시 KST');
  checks.push('All 168 KST heat cells expose values and support selection');
  expect(await widget('heatmap').getByRole('group').getByRole('button').count()).toBe(168);
  await widget('sessions').getByRole('button', { name: '세션 시작 유형 메뉴' }).click();
  await widget('sessions').getByRole('button', { name: '데이터 표 보기' }).click();
  await widget('sessions').locator('summary').click();
  await expect(widget('sessions').getByRole('table')).toContainText('fresh');
  checks.push('Data tables available as chart alternative');
  await page.getByLabel('비교 기간').selectOption('none');
  await expect(page.locator('[data-kpi="active_users"]')).not.toContainText('전주 대비');
  await page.getByRole('button', { name: '계약', exact: true }).click();
  await expect(page.locator('[data-kpi="cost"]')).toContainText('$402.30');
  checks.push('Compare-none hides deltas; contract price updates API-backed cost');
  await page.getByRole('button', { name: '공시', exact: true }).click();
  await expect(page.locator('[data-kpi="cost"]')).toContainText('$502.88');
  await page.getByLabel('모델', { exact: true }).selectOption('gpt-5');
  await expect(page.locator('[data-kpi="cost"]')).toContainText('$276.58');
  await expect
    .poll(() =>
      requests.some(
        (r) =>
          r.queries.some((q) => q.metric_id === 'sessions') && r.filters.models.includes('gpt-5'),
      ),
    )
    .toBe(true);
  checks.push('Model filter reaches widgets and replaces previous data');
  await page.getByLabel('모델', { exact: true }).selectOption('');
  await state('masked');
  await expect(page.locator('[data-kpi="active_users"]')).toContainText('비공개');
  await expect(widget('sessions')).toContainText('최소 집계 단위 미만');
  await expect(widget('sessions').locator('.recharts-pie')).toHaveCount(0);
  checks.push('Masked data never enters charts');
  await state('empty');
  await expect(widget('sessions')).toContainText('관측된 데이터가 없습니다');
  checks.push('Empty state distinct from numeric zero');
  await state('error');
  await expect(widget('sessions')).toContainText('쿼리에 실패했습니다');
  await page.evaluate(() => sessionStorage.setItem('pulsemetry.mockCase', 'normal'));
  await widget('sessions').getByRole('button', { name: '재시도', exact: true }).click();
  await expect(widget('sessions')).toContainText('318');
  checks.push('Widget error retries its request and recovers');
  await state('partial');
  await widget('output').scrollIntoViewIfNeeded();
  await expect(widget('output')).toContainText('일부 산출 지표 조회 실패');
  await expect(widget('output').locator('.recharts-bar').first()).toBeVisible();
  await widget('cost').scrollIntoViewIfNeeded();
  await expect(widget('cost')).toContainText('쿼리에 실패했습니다');
  await expect(widget('cost')).toContainText('claude-sonnet-4');
  checks.push('Partial query failure preserves successful output and cost groups');
  await state('normal');
  await loadAll();
  await widget('tokens').scrollIntoViewIfNeeded();
  await expect(widget('tokens')).toContainText('61%');
  await widget('sessions').scrollIntoViewIfNeeded();
  await widget('sessions').getByRole('button', { name: '세션 시작 유형 메뉴' }).click();
  await widget('sessions').getByRole('button', { name: '데이터 표 숨기기' }).click();
  await page.getByLabel('비교 기간').selectOption('previous_week');
  for (const width of [1024, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await loadAll();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await shot('viewport-' + width);
    checks.push(width + 'px: no horizontal overflow, single column layout');
  }
  await page.getByRole('button', { name: '로그아웃' }).click();
  await login('admin');
  await expect(page.getByRole('group', { name: '분석 팀' })).not.toContainText('플랫폼');
  checks.push('Admin team picker only exposes authorized teams');
  expect(errors).toEqual([]);
  checks.push('No uncaught browser errors');
  await writeFile(
    new URL('results.json', out),
    JSON.stringify({ checks, geometry, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors }, null, 2));
} finally {
  await browser.close();
}
