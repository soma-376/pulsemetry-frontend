import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = new URL('../docs/validation/phase-6/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const checks = [],
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
async function login() {
  await page.getByRole('button', { name: 'owner 계정 입력' }).click();
  await page.getByRole('button', { name: '로그인', exact: true }).click();
}
async function mode(v) {
  await page.evaluate((v) => sessionStorage.setItem('pulsemetry.mockCase', v), v);
}
try {
  await page.goto('http://127.0.0.1:5173/scenarios');
  await mode('empty');
  await login();
  await expect(page.getByText('등록된 시나리오가 없습니다.')).toBeVisible();
  await page.screenshot({ path: new URL('empty.png', out).pathname });
  checks.push('Empty catalog');
  await mode('error');
  await page.reload();
  await login();
  await expect(page.getByRole('button', { name: '카탈로그 재시도' })).toBeVisible();
  await page.screenshot({ path: new URL('catalog-error.png', out).pathname });
  await mode('loading');
  await page.getByRole('button', { name: '카탈로그 재시도' }).click();
  await expect(page.getByText('카탈로그 불러오는 중…')).toBeVisible();
  await page.screenshot({ path: new URL('catalog-loading.png', out).pathname });
  await expect(page.getByRole('heading', { name: '질문을 골라 시작하세요' })).toBeVisible();
  checks.push('Catalog error retry and loading skeleton');
  await mode('normal');
  await page.getByRole('button', { name: '전체 46개 질문 보기' }).click();
  await page
    .locator('button')
    .filter({ has: page.locator('code', { hasText: 'S1-4' }) })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: '실행', exact: true })).toBeEnabled();
  for (let i = 0; i < 15; i++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement.closest('dialog'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement.textContent.includes('S1-4'))).toBe(true);
  checks.push('Partial available form, native dialog focus trap and Escape restoration');
  await page.keyboard.press('/');
  await expect(page.getByRole('searchbox', { name: '시나리오 검색' })).toBeFocused();
  await page.keyboard.type('S1-3');
  await expect(page.locator('[data-availability]')).toHaveCount(1);
  checks.push('Keyboard search shortcut');
  expect(errors).toEqual([]);
} finally {
  await writeFile(new URL('state-results.json', out), JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ checks, errors }, null, 2));
