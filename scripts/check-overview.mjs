import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const out = new URL('../docs/validation/phase-4/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const checks = [],
  errors = [],
  requests = [];
page.on('pageerror', (e) => errors.push(e.stack));
page.on('request', (r) => {
  if (r.url().endsWith('/v1/query')) requests.push(JSON.parse(r.postData()));
});
const w = (id) => page.locator(`[data-widget="overview-${id}"]`);
async function load(id) {
  await expect(async () => {
    await w(id).scrollIntoViewIfNeeded();
  }).toPass({ timeout: 10000 });
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await expect(w(id).getByText('불러오는 중…')).toHaveCount(0);
  await expect(w(id)).toHaveAttribute('data-fetching', 'false');
}
async function all() {
  for (const id of [
    'cost',
    'teams',
    'models',
    'output',
    'adoption',
    'trust',
    'health',
    'governance',
  ])
    await load(id);
}
async function shot(name) {
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: new URL(name + '.png', out).pathname, fullPage: true });
}
async function state(s) {
  await page.evaluate((v) => sessionStorage.setItem('pulsemetry.mockCase', v), s);
  await page.getByRole('button', { name: '새로고침', exact: true }).click();
}
try {
  await page.goto('http://127.0.0.1:5173/?compare=previous_week');
  await page.getByRole('button', { name: 'owner 계정 입력' }).click();
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '개요', exact: true })).toBeVisible();
  expect(requests.some((r) => r.queries.some((q) => q.metric_id === 'llm_ttft_ms'))).toBe(false);
  checks.push('Offscreen health deferred');
  await all();
  await expect(page.locator('[data-kpi]')).toHaveCount(6);
  await expect(w('governance')).toContainText('7');
  await expect(w('adoption')).toContainText('n<5');
  await expect(w('cost').locator('.recharts-line')).toHaveCount(3);
  checks.push('Six KPIs and eight widgets, compare and masked rows');
  await shot('desktop-light');
  await writeFile(
    new URL('geometry.json', out),
    JSON.stringify(
      await page.locator('[data-kpi],[data-widget]').evaluateAll((es) =>
        es.map((e) => {
          const r = e.getBoundingClientRect();
          return {
            id: e.getAttribute('data-kpi') || e.getAttribute('data-widget'),
            x: r.x,
            y: r.y + window.scrollY,
            width: r.width,
            height: r.height,
          };
        }),
      ),
      null,
      2,
    ),
  );
  await page.getByRole('button', { name: '다크', exact: true }).click();
  await shot('desktop-dark');
  await page.getByRole('button', { name: '라이트', exact: true }).click();
  await page.getByLabel('비교 기간').selectOption('none');
  await load('cost');
  await expect(w('cost').locator('.recharts-line')).toHaveCount(2);
  await expect(page.locator('[data-kpi]').getByText(/대비/)).toHaveCount(0);
  checks.push('No comparison hides deltas and previous line');
  await page.getByRole('button', { name: '28d', exact: true }).click();
  await load('cost');
  expect(
    requests.some(
      (r) =>
        r.from === 'now-28d' &&
        r.queries.some((q) => q.metric_id === 'cost' && q.frame_type === 'timeseries'),
    ),
  ).toBe(true);
  await page.getByRole('button', { name: '계약', exact: true }).click();
  await expect(page.locator('[data-kpi="cost"]')).toContainText('$5,120.23');
  await page.getByRole('button', { name: '공시', exact: true }).click();
  await page.getByRole('button', { name: '7d', exact: true }).click();
  await page.getByLabel('모델', { exact: true }).selectOption('gpt-5');
  await load('models');
  await expect(w('models').locator('code')).toHaveCount(1);
  await expect(w('models')).toContainText('gpt-5');
  await page.getByLabel('모델', { exact: true }).selectOption('');
  await all();
  expect(
    requests.some(
      (r) =>
        r.from === 'now-8w/w' &&
        r.to === 'now/w' &&
        r.queries.some((q) => q.metric_id === 'adoption_rate'),
    ),
  ).toBe(true);
  expect(
    requests.some(
      (r) =>
        r.from === 'now-24h' &&
        r.to === 'now' &&
        r.compare === 'none' &&
        r.queries.some((q) => q.metric_id === 'llm_ttft_ms'),
    ),
  ).toBe(true);
  checks.push(
    'Period, contract and model filters update data; weekly and health exceptions retained',
  );

  await page.evaluate(() => sessionStorage.setItem('pulsemetry.mockCase', 'error'));
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  await page.getByRole('button', { name: '다운로드', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await page.evaluate(() => sessionStorage.setItem('pulsemetry.mockCase', 'normal'));
  checks.push('CSV HTTP failure stays in dialog without fake file');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  await page.getByRole('dialog').getByLabel('지표').selectOption({ label: '팀별 비용' });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '다운로드', exact: true }).click();
  const file = await download;
  const csv = await readFile(await file.path(), 'utf8');
  expect(csv).toContain('n<5');
  expect(csv).toContain('cost');
  checks.push('CSV downloads scoped first query with n<5');
  await w('teams').getByRole('link', { name: '결제 팀 분석' }).click();
  await expect(page).toHaveURL(/\/teams\?.*teams=111/);
  await expect(page.getByRole('heading', { name: '팀 분석', exact: true })).toBeVisible();
  checks.push('Team bar opens P2 with filters');
  await page.getByRole('link', { name: '개요', exact: true }).click();
  await all();
  await expect(w('governance')).toContainText('전사 조회에서만');
  checks.push('Scoped governance omits refusal query');
  await page
    .getByLabel('부서', { exact: true })
    .selectOption('33333333-3333-4333-8333-333333333333');
  await expect(page.getByText('최소 집계 단위 미만', { exact: true })).toBeVisible();
  await expect(page.locator('[data-kpi]')).toHaveCount(0);
  await expect(page.locator('[data-widget]')).toHaveCount(0);
  await shot('small-team');
  await page.getByRole('button', { name: '접근 가능한 전체 팀으로 돌아가기' }).click();
  await all();
  checks.push('Small team masks whole overview and returns');
  await state('partial');
  await all();
  await expect(w('cost').getByText('쿼리에 실패했습니다')).toBeVisible();
  await expect(w('cost').locator('.recharts-line')).toHaveCount(1);
  checks.push('Partial cost failure keeps successful series');
  await state('error');
  await load('cost');
  await expect(w('cost').getByText('쿼리에 실패했습니다')).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem('pulsemetry.mockCase', 'normal'));
  await w('cost').getByRole('button', { name: '재시도' }).click();
  await load('cost');
  await expect(w('cost').locator('.recharts-line')).toHaveCount(2);
  checks.push('Error and retry recover');
  await state('empty');
  await all();
  await expect(w('teams')).toContainText('이 기간에 관측된 데이터가 없습니다');
  checks.push('Empty data state');
  await state('normal');
  await all();
  for (const width of [1024, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await all();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await shot('viewport-' + width);
  }
  checks.push('1024 and 768 layouts without page overflow');
  await page.getByRole('button', { name: '로그아웃' }).click();
  await page.getByRole('button', { name: 'admin 계정 입력' }).click();
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await all();
  await expect(w('teams').getByRole('link')).toHaveCount(1);
  await expect(w('teams')).not.toContainText('플랫폼');
  await expect(w('governance')).toContainText('전사 조회에서만');
  checks.push('Admin stays in own team');
  expect(errors).toEqual([]);
  checks.push('No uncaught browser errors');
  await writeFile(new URL('results.json', out), JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, errors }));
} catch (e) {
  console.log(JSON.stringify({ errors, body: await page.locator('body').innerText() }));
  throw e;
} finally {
  await browser.close();
}
