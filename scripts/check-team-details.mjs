import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = new URL(`../docs/validation/${process.env.VALIDATION_DIR || 'phase-3'}/`, import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const checks = [],
  errors = [],
  requests = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  if (r.url().endsWith('/v1/query')) requests.push(JSON.parse(r.postData()));
});
const w = (id) => page.locator(`[data-widget="${id}"]`);
async function load(id) {
  await w(id).scrollIntoViewIfNeeded();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect(w(id).getByText('불러오는 중…')).toHaveCount(0);
  await expect(w(id)).toHaveAttribute('data-fetching', 'false');
}
async function all() {
  for (const id of [
    'sessions',
    'prompts',
    'heatmap',
    'output',
    'cost',
    'tokens',
    'friction-0',
    'features',
    'compaction',
    'quality',
  ])
    await load(id);
}
async function shot(name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: new URL(name + '.png', out).pathname, fullPage: true });
}
async function state(value) {
  await page.evaluate((v) => sessionStorage.setItem('pulsemetry.mockCase', v), value);
  await page.getByRole('button', { name: '새로고침', exact: true }).click();
}
try {
  await page.goto(
    (process.env.BASE_URL || 'http://127.0.0.1:5173') +
      '/teams?compare=previous_week&teams=11111111-1111-4111-8111-111111111111',
  );
  await page.getByRole('button', { name: 'owner 계정 입력' }).click();
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('navigation')).toBeVisible();
  expect(requests.some((r) => r.queries.some((q) => q.metric_id === 'gate_wait_ms'))).toBe(false);
  await all();
  await expect(w('friction-0')).toContainText('76.4%');
  const shell = w('friction-0').getByRole('row').filter({ hasText: 'Shell' });
  await expect(shell).toContainText('n<5');
  await expect(shell).not.toContainText('0%');
  checks.push('Language rows remain visible; small group numeric cells are masked');
  await expect(w('features')).toContainText('18%');
  await expect(w('features').getByText('준비 중')).toHaveCount(2);
  await expect(w('quality')).not.toContainText('figma');
  await expect(w('quality')).toContainText('3.1%');
  checks.push('Feature availability and org-only quality scope');
  await expect(w('compaction').locator('.recharts-bar')).toHaveCount(2);
  await expect(w('compaction').locator('.recharts-line')).toHaveCount(1);
  checks.push('Compaction count bars and reduction axis rendered');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('desktop-light');
  for (const id of ['friction-0', 'features', 'compaction', 'quality'])
    await w(id).screenshot({ path: new URL(id + '.png', out).pathname });
  const geometry = await page.locator('[data-widget]').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: el.getAttribute('data-widget'),
        x: r.x,
        y: r.y + window.scrollY,
        width: r.width,
        height: r.height,
      };
    }),
  );
  await writeFile(new URL('geometry.json', out), JSON.stringify(geometry, null, 2));
  await page.getByRole('button', { name: '다크', exact: true }).click();
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await shot('desktop-dark');
  await page.getByRole('button', { name: '라이트', exact: true }).click();
  for (const [tab, id, content] of [
    ['자동 승인 비율', '1', '23.8%'],
    ['권한 대기 시간', '2', '41.2s'],
    ['거절 출처', '3', 'mcp__github'],
  ]) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await load('friction-' + id);
    await expect(w('friction-' + id)).toContainText(content);
    await w('friction-' + id).screenshot({
      path: new URL('friction-' + id + '.png', out).pathname,
    });
  }
  expect(
    requests.some((r) =>
      r.queries.some((q) => q.metric_id === 'gate_wait_ms' && q.frame_type === 'distribution'),
    ),
  ).toBe(true);
  checks.push('Four friction tabs fetch their own metric and render values');
  await page.getByRole('tab', { name: '거절 출처', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: '권한 대기 시간', exact: true })).toHaveAttribute(
    'data-state',
    'active',
  );
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: '언어별 수락률', exact: true })).toHaveAttribute(
    'data-state',
    'active',
  );
  await load('friction-0');
  checks.push('Arrow and Home keys switch accessible tabs');
  await state('partial');
  await load('features');
  await expect(w('features')).toContainText('github');
  await expect(w('features')).toContainText('쿼리에 실패했습니다');
  await load('compaction');
  await expect(w('compaction')).toContainText('쿼리에 실패했습니다');
  await expect(w('compaction').locator('.recharts-bar')).toHaveCount(2);
  checks.push('Partial failures retain successful feature and compaction results');
  await page.evaluate(() => sessionStorage.setItem('pulsemetry.mockCase', 'normal'));
  await w('compaction').getByRole('button', { name: '재시도', exact: true }).click();
  await expect(w('compaction').getByText('쿼리에 실패했습니다')).toHaveCount(0);
  checks.push('Partial result retry recovers');
  await state('empty');
  await load('features');
  await expect(w('features')).toContainText('관측된 데이터가 없습니다');
  checks.push('Empty data is distinct from zero and unavailable');
  await state('normal');
  await all();
  await expect(w('compaction')).toContainText('63%');
  for (const width of [1024, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await all();
    await expect(w('quality')).toContainText('3.1%');
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await shot('viewport-' + width);
  }
  checks.push('1024 and 768 layouts do not overflow');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .getByRole('group', { name: '분석 팀' })
    .getByRole('button', { name: '정산', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: '이 팀은 활성 인원이 5명 미만이라 집계를 표시하지 않습니다',
    }),
  ).toBeVisible();
  await expect(page.locator('[data-widget]')).toHaveCount(0);
  await expect(page.locator('[data-kpi]')).toHaveCount(0);
  await expect(page.getByRole('status', { name: '텔레메트리 커버리지' })).toContainText('n<5');
  await page.getByText('마스킹 정책 안내', { exact: true }).click();
  await expect(
    page.getByText('5명 미만 그룹의 수치·비율·그래프·비교값을 표시하지 않습니다.', {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByText('마스킹 정책 안내', { exact: true }).click();
  await shot('small-team');
  checks.push('Small team suppresses all widgets, KPI and coverage numbers');
  await page.getByRole('button', { name: '접근 가능한 전체 팀으로 보기' }).click();
  await expect(page.locator('[data-kpi="active_users"]')).toBeVisible();
  checks.push('Masked state returns to accessible aggregate scope');
  expect(errors).toEqual([]);
  checks.push('No unhandled browser errors');
  await writeFile(new URL('results.json', out), JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, errors }));
} finally {
  await browser.close();
}
