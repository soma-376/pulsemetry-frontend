import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = new URL(
  '../docs/validation/' + (process.env.VALIDATION_DIR || 'phase-1') + '/',
  import.meta.url,
);
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const errors = [],
  checks = [],
  requests = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  if (r.url().endsWith('/v1/query')) requests.push(JSON.parse(r.postData()));
});
async function shot(name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: new URL(name + '.png', out).pathname, fullPage: true });
}
async function login(role = 'owner') {
  await page.getByRole('button', { name: role + ' 계정 입력' }).click();
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('navigation')).toBeVisible();
  await expect(page.getByRole('status', { name: '텔레메트리 커버리지' })).toContainText(
    '활성 설치',
  );
}
try {
  await page.goto(base + '/teams?from=now-28d&price=contract');
  await expect(page.getByRole('heading', { name: 'Pulsemetry' }).last()).toBeVisible();
  await shot('login');
  await login();
  await expect(page).toHaveURL(/\/teams\?.*now-28d/);
  checks.push('Protected deep link restored after login');
  await page.getByRole('button', { name: '7d', exact: true }).click();
  await expect(page).toHaveURL(/from=now-7d/);
  await expect(page.getByRole('button', { name: '7d', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByLabel('부서', { exact: true }).selectOption({ label: '결제' });
  await page.getByRole('button', { name: '공시', exact: true }).click();
  await expect(page.getByRole('status', { name: '텔레메트리 커버리지' })).toContainText('92%');
  await expect.poll(() => requests.at(-1)?.filters.team_ids?.length).toBe(1);
  await shot('desktop-light');
  const dimensions = await page.evaluate(() => ({
    sidebar: document.querySelector('aside[aria-label="주 내비게이션"]').getBoundingClientRect()
      .width,
    toolbar: document
      .querySelector('[aria-label="기간"]')
      .parentElement.parentElement.getBoundingClientRect().height,
    coverage: document.querySelector('[role="status"]').getBoundingClientRect().height,
  }));
  await page.getByLabel('비교 기간').selectOption('previous_period');
  await page.getByLabel('모델', { exact: true }).selectOption('gpt-5');
  await page.getByRole('button', { name: 'claude_code', exact: true }).click();
  await expect.poll(() => requests.at(-1)?.filters.products).toEqual(['codex']);
  await page.getByRole('link', { name: '개요', exact: true }).click();
  await expect(page).toHaveURL(/models=gpt-5/);
  checks.push('Team/product/model/compare/price filters survive navigation and reach request');
  await page.goBack();
  await expect(page.getByRole('heading', { name: '팀 분석', exact: true })).toBeVisible();
  checks.push('Browser back restores route and filter state');
  await page.getByLabel('사용자 지정 기간').click();
  await page.getByLabel('시작일', { exact: true }).fill('2026-09-01');
  await page.getByLabel('종료일 (미포함)').fill('2026-09-06');
  await page.getByRole('button', { name: '기간 적용' }).click();
  await expect.poll(() => requests.at(-1)?.from).toBe('2026-09-01T00:00:00+09:00');
  checks.push('Custom range preserves KST and exclusive end');
  await page.getByRole('switch').check();
  await expect(page.getByRole('switch')).toBeChecked();
  await page.getByRole('switch').uncheck();
  await expect(page.getByRole('button', { name: '새로고침', exact: true })).toBeEnabled();
  const count = requests.length;
  await page.getByRole('button', { name: '새로고침', exact: true }).click();
  await expect.poll(() => requests.length).toBeGreaterThan(count);
  checks.push('Manual refresh issues new query; 5-minute toggle works');
  await page.getByRole('button', { name: '메뉴 접기' }).click();
  await expect(page.locator('aside[aria-label="주 내비게이션"]')).toHaveCSS('width', '56px');
  await page.getByRole('button', { name: '메뉴 펼치기' }).click();
  checks.push('Sidebar collapse and expand');
  await page.getByRole('button', { name: '다크', exact: true }).click();
  await shot('desktop-dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
  await login();
  checks.push('Memory-only login expires on reload; theme persists');
  await page.getByRole('button', { name: '라이트', exact: true }).click();
  for (const width of [1440, 1024, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await shot('viewport-' + width);
    checks.push(width + 'px no horizontal overflow');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('768px 이상의 화면에서 이용해 주세요.').first()).toBeVisible();
  checks.push('Narrow-screen message');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('link', { name: '시나리오', exact: true }).click();
  await page.getByRole('link', { name: 'API 상태 검증 도구' }).click();
  for (const [state, text] of [
    ['empty', '관측된 데이터가 없습니다'],
    ['masked', '최소 집계 단위 미만'],
    ['partial', '쿼리에 실패했습니다'],
    ['error', '쿼리에 실패했습니다'],
  ]) {
    await page.getByLabel('목업 상태').selectOption(state);
    await expect(page.getByTestId('result-B')).toContainText(text);
    if (state === 'partial') await expect(page.getByTestId('result-A')).not.toContainText('실패');
    checks.push(state + ' state displays correctly');
  }
  await page.getByLabel('목업 상태').selectOption('normal');
  await expect(page.getByTestId('result-B')).not.toContainText('실패');
  await page.getByLabel('목업 상태').selectOption('meta-error');
  await expect(
    page.getByRole('alert').filter({ hasText: '필터를 불러오지 못했습니다' }),
  ).toBeVisible();
  await page.getByLabel('목업 상태').selectOption('normal');
  await expect(
    page.getByRole('alert').filter({ hasText: '필터를 불러오지 못했습니다' }),
  ).toHaveCount(0);
  checks.push('Metadata error recovers independently');
  await page.getByRole('button', { name: '로그아웃' }).click();
  await login('admin');
  await expect(page.getByRole('link', { name: '운영 · 보안', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('부서', { exact: true }).locator('option')).toHaveCount(2);
  await page.evaluate(() => {
    history.pushState({}, '', '/operations');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { name: '접근 권한이 없습니다' })).toBeVisible();
  checks.push('Admin team scope and direct-route guard');
  expect(errors).toEqual([]);
  checks.push('No uncaught browser errors');
  await writeFile(
    new URL('results.json', out),
    JSON.stringify({ checks, dimensions, errors }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length, dimensions, errors }));
} finally {
  await browser.close();
}
