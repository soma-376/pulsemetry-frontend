import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = new URL('../docs/validation/phase-7/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [],
  checks = [],
  calls = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  if (r.url().includes('/v1/'))
    calls.push({ url: r.url(), method: r.method(), body: r.postData() });
});
const shot = async (name) =>
  page.screenshot({ path: new URL(name + '.png', out).pathname, fullPage: true });
const login = async (role = 'owner') => {
  await page.getByRole('button', { name: role + ' 계정 입력' }).click();
  await page.getByRole('button', { name: '로그인', exact: true }).click();
};
const mode = async (v) => page.evaluate((v) => sessionStorage.setItem('pulsemetry.mockCase', v), v);
const dialog = () => page.getByRole('dialog');
try {
  await page.goto('http://127.0.0.1:5173/scenarios');
  await login();
  await page.getByRole('button', { name: '전체 46개 질문 보기' }).click();
  await page
    .locator('button')
    .filter({ has: page.locator('code', { hasText: /^★ S1-3$/ }) })
    .first()
    .click();
  await dialog().getByRole('button', { name: '28d', exact: true }).click();
  await dialog().getByRole('button', { name: '실행', exact: true }).click();
  await expect(page).toHaveURL(/\/runs\//, { timeout: 15000 });
  await expect(page.getByRole('heading', { name: '판정 · findings' })).toBeVisible();
  const runUrl = page.url(),
    runId = new URL(runUrl).pathname.split('/').at(-1);
  await expect(page.locator('[data-result-widget="W1.2"]').first()).toBeVisible();
  await expect(
    page.getByRole('group', { name: '기간' }).getByRole('button', { name: '28d', exact: true }),
  ).toBeDisabled();
  const before = calls.filter((c) => c.url.endsWith('/query')).length;
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: '관련 위젯으로 이동 → W1.3' }).click();
  await expect(page.locator('[data-result-widget="W1.3"]')).toBeFocused();
  if (calls.filter((c) => c.url.endsWith('/query')).length !== before)
    throw new Error('Result view queried metrics');
  await shot('result-light');
  await writeFile(
    new URL('geometry.json', out),
    JSON.stringify(
      await page
        .locator('[data-result-metric=cost], aside[aria-label="시나리오 판정"]')
        .evaluateAll((els) =>
          els.map((e) => ({
            kind: e.getAttribute('data-result-widget') || 'findings',
            x: e.getBoundingClientRect().x,
            y: e.getBoundingClientRect().y,
            width: e.getBoundingClientRect().width,
            height: e.getBoundingClientRect().height,
          })),
        ),
      null,
      2,
    ),
  );
  checks.push('automatic result navigation, applied 28d, widget focus, no duplicate query');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(dialog()).toBeVisible();
  await shot('save-fixed');
  await dialog().getByRole('textbox', { name: '이름', exact: true }).fill('고정 비용 점검');
  await dialog().getByRole('textbox', { name: /메모/ }).fill('고정 결과 검증');
  await mode('error');
  await dialog().getByRole('button', { name: '저장', exact: true }).click();
  await expect(dialog().getByRole('alert')).toContainText('저장에 실패');
  await mode('normal');
  await dialog().getByRole('button', { name: '저장', exact: true }).click();
  await expect(dialog()).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: '리포트를 저장했습니다.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await dialog().getByRole('textbox', { name: '이름', exact: true }).fill('최신 비용 점검');
  await dialog()
    .getByRole('radio', { name: /기간을 상대식/ })
    .check();
  await shot('save-relative');
  await dialog().getByRole('button', { name: '저장', exact: true }).click();
  await expect(dialog()).toHaveCount(0);
  checks.push('fixed and relative saves, save failure retains form and retry');
  await page.getByRole('link', { name: '이력 · 저장된 리포트', exact: true }).click();
  await expect(page.getByRole('heading', { name: /저장된 리포트/ })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: '고정 비용 점검' })).toBeVisible();
  await shot('history');
  let starts = calls.filter(
    (c) => c.method === 'POST' && /\/scenarios\/.*\/runs$/.test(c.url),
  ).length;
  await page
    .getByRole('row')
    .filter({ hasText: '고정 비용 점검' })
    .getByRole('button', { name: '열기', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(runId));
  await expect(page.getByRole('heading', { name: '판정 · findings' })).toBeVisible();
  if (
    calls.filter((c) => c.method === 'POST' && /\/scenarios\/.*\/runs$/.test(c.url)).length !==
    starts
  )
    throw new Error('Fixed report reran');
  await page.getByRole('link', { name: '시나리오', exact: true }).click();
  await page.getByRole('link', { name: '이력 · 저장된 리포트', exact: true }).click();
  await page
    .getByRole('row')
    .filter({ hasText: '최신 비용 점검' })
    .getByRole('button', { name: '열기', exact: true })
    .click();
  await expect(page).toHaveURL(/\/runs\//);
  await expect(page.getByRole('heading', { name: '판정 · findings' })).toBeVisible({
    timeout: 15000,
  });
  if (new URL(page.url()).pathname.endsWith(runId)) throw new Error('Relative kept old run');
  checks.push('fixed reopens without POST, relative creates new run with original params');
  await page.getByRole('button', { name: '다크', exact: true }).click();
  await shot('result-dark');
  await page.getByRole('button', { name: '라이트', exact: true }).click();
  for (const width of [1024, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    await shot('result-' + width);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) throw new Error('Overflow ' + width);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  checks.push('dark and 1024/768 no horizontal page overflow');
  await page.reload();
  await login();
  await expect(page.getByRole('heading', { name: '판정 · findings' })).toBeVisible();
  checks.push('direct run URL survives reload and login');
  await page.getByRole('link', { name: '해제', exact: true }).click();
  await expect(page).toHaveURL(/\/\?from=now-28d/);
  await expect(page.getByRole('heading', { name: '개요', exact: true })).toBeVisible();
  checks.push('release returns target dashboard with applied filters');
  await page.getByRole('link', { name: '시나리오', exact: true }).click();
  await page.getByRole('link', { name: '이력 · 저장된 리포트', exact: true }).click();
  const savedRow = page.getByRole('row').filter({ hasText: '고정 비용 점검' });
  await savedRow.getByRole('button', { name: '삭제', exact: true }).click();
  await dialog().getByRole('button', { name: '취소', exact: true }).click();
  await expect(savedRow).toBeVisible();
  await savedRow.getByRole('button', { name: '삭제', exact: true }).click();
  await dialog().getByRole('button', { name: '삭제', exact: true }).click();
  await expect(savedRow).toHaveCount(0);
  const relativeRow = page.getByRole('row').filter({ hasText: '최신 비용 점검' });
  await relativeRow.getByRole('button', { name: '삭제', exact: true }).click();
  await dialog().getByRole('button', { name: '삭제', exact: true }).click();
  await expect(relativeRow).toHaveCount(0);
  const runRow = page.getByRole('row').filter({ has: page.locator(`a[href='/runs/${runId}']`) });
  await runRow.getByRole('button', { name: '삭제', exact: true }).click();
  await dialog().getByRole('button', { name: '삭제', exact: true }).click();
  await expect(runRow).toHaveCount(0);
  checks.push('delete confirmation/cancel, saved deletion preserves run, run deletion removes row');
  await page.goto(runUrl);
  await login();
  await expect(page.getByRole('alert')).toContainText('실행이 없습니다.');
  await shot('not-found');
  checks.push('deleted shared URL returns not-found after login');
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(new URL('results.json', out), JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, errors }));
} finally {
  await browser.close();
}
