import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
expect.configure({ timeout: 1500 });
const out = new URL(
  `../docs/validation/${process.env.VALIDATION_DIR || 'phase-8/accessibility'}/`,
  import.meta.url,
);
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const checks = [],
  failures = [],
  errors = [];
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
});
page.on('pageerror', (e) => errors.push(e.message));
async function check(name, fn) {
  try {
    await fn();
    checks.push(name);
  } catch (e) {
    failures.push({ name, message: e.message.split('Call log:')[0] });
  }
  await writeFile(
    new URL('results.json', out),
    JSON.stringify({ checks, failures, errors }, null, 2),
  );
}
async function login(role) {
  await page.getByRole('button', { name: `${role} 계정 입력` }).click();
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.locator('#page-content')).toBeVisible();
}
async function cycle(dialog) {
  for (let i = 0; i < 22; i++) {
    await page.keyboard.press(i < 11 ? 'Tab' : 'Shift+Tab');
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
}
try {
  await page.goto('http://127.0.0.1:5173/teams');
  await login('owner');
  await expect(page.getByLabel('부서', { exact: true })).toBeEnabled();
  const date = page.getByRole('button', { name: '사용자 지정 기간' });
  await date.click();
  await page.keyboard.press('Escape');
  await check('Date Escape restores trigger focus', () => expect(date).toBeFocused());
  await date.click();
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await check('Date cancel restores trigger focus', () => expect(date).toBeFocused());
  await page.getByRole('link', { name: '시나리오', exact: true }).click();
  const welcome = page.getByRole('button', { name: '전체 46개 질문 보기' });
  if (await welcome.isVisible()) await welcome.click();
  await page.getByRole('searchbox', { name: '시나리오 검색' }).fill('S1-3');
  const opener = page
    .locator('button')
    .filter({ has: page.locator('code', { hasText: /^★? ?S1-3$/ }) })
    .first();
  await opener.click();
  await expect(page.getByRole('heading', { name: '이 질문에 답하는 지표' })).toBeVisible();
  await check('Scenario drawer Tab and Shift+Tab stay inside', () =>
    cycle(page.getByRole('dialog')),
  );
  await page.keyboard.press('Escape');
  await check('Scenario Escape restores opener', () => expect(opener).toBeFocused());
  await page.getByRole('link', { name: '운영 · 보안', exact: true }).click();
  await page.getByRole('tab', { name: '세션 조회(감사)' }).click();
  await page.getByLabel('세션 식별자').fill('sess_demo');
  const audit = page.getByRole('button', { name: '조회 · 사유 입력', exact: true });
  await audit.click();
  await check('Audit modal Tab and Shift+Tab stay inside', () => cycle(page.getByRole('dialog')));
  await page.keyboard.press('Escape');
  await check('Audit Escape restores opener', () => expect(audit).toBeFocused());
  const routes = [
    ['개요', '/'],
    ['팀 분석', '/teams'],
    ['운영 · 보안', '/operations'],
    ['시나리오', '/scenarios'],
    ['설정', '/settings'],
  ];
  for (const role of ['owner', 'admin']) {
    if (role === 'admin') {
      await page.getByRole('button', { name: '로그아웃' }).click();
      await login(role);
    }
    for (const [name, path] of routes.filter(
      ([name]) => role === 'owner' || name !== '운영 · 보안',
    )) {
      await page.getByRole('link', { name, exact: true }).click();
      await expect(page.locator('#page-content')).toBeVisible();
      await check(`${role} ${path}: page title`, () =>
        expect(page).toHaveTitle(`${name} · Pulsemetry`),
      );
      for (const theme of ['라이트', '다크']) {
        await page.getByRole('button', { name: theme, exact: true }).click();
        for (const width of [1440, 1024, 768]) {
          await page.setViewportSize({ width, height: 1000 });
          await check(`${role} ${path} ${theme} ${width}: no overflow`, () =>
            expect
              .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
              .toBe(true),
          );
        }
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('link', { name: '본문으로 이동' }).focus();
  await page.keyboard.press('Enter');
  await check('Skip link focuses main', () => expect(page.locator('#page-content')).toBeFocused());
  await check('No runtime errors', async () => expect(errors).toEqual([]));
  await writeFile(
    new URL('results.json', out),
    JSON.stringify({ checks, failures, errors }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length, failures, errors }));
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
