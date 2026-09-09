import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// Run against an already running local Vite server. No live API calls.
const out = new URL('../docs/validation/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
const checks = [];
async function screenshot(name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: new URL(name, out).pathname, fullPage: true, animations: 'disabled' });
}
async function noOverflow(width) {
  await page.setViewportSize({ width, height: 1100 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  checks.push(`${width}px: no page horizontal overflow`);
}
try {
  await page.goto(process.env.BASE_URL ?? 'http://127.0.0.1:5173');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('heading', { name: '하나의 규칙으로, 일관된 분석 경험' })).toBeVisible();
  await expect(page.locator('[data-component="kpi-card"]')).toHaveCount(8);
  await noOverflow(1440);
  await screenshot('desktop-light.png');
  await page.getByTestId('kpi-gallery').screenshot({ path: new URL('kpi-light.png', out).pathname });
  const dimensions = await page.locator('[data-component="kpi-card"]').first().evaluate(el => {
    const style = getComputedStyle(el);
    return { width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height, padding: style.padding, radius: style.borderRadius, font: style.fontFamily };
  });
  await page.getByRole('button', { name: '활성 사용자 정의', exact: true }).first().focus();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.keyboard.press('Escape');
  checks.push('KPI definition is accessible by keyboard');
  await page.getByRole('button', { name: '재시도', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  checks.push('Retry demo replaces error with empty state');
  await page.getByRole('tab', { name: '공통 컴포넌트' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: '디자인 토큰 46' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('code').filter({ hasText: /^surface\/bg$/ })).toBeVisible();
  checks.push('Tabs support keyboard navigation');
  await page.getByRole('tab', { name: '공통 컴포넌트' }).click();
  await page.getByRole('button', { name: '다크', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await screenshot('desktop-dark.png');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  checks.push('Theme persists across reload');
  await page.getByRole('button', { name: '라이트', exact: true }).click();
  for (const width of [1024, 768]) { await noOverflow(width); await screenshot(`tablet-${width}.png`); }
  await noOverflow(390);
  await expect(page.getByText('768px 이상의 화면에서 이용해 주세요.')).toBeVisible();
  checks.push('Small-screen support message is shown');
  expect(errors).toEqual([]);
  checks.push('No browser console errors');
  await writeFile(new URL('browser-results.json', out), JSON.stringify({ checkedAt: new Date().toISOString(), checks, kpiDimensions: dimensions, errors }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: checks.length, dimensions, errors }));
} finally { await browser.close(); }
