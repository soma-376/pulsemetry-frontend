import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = new URL(`../docs/validation/${process.env.VALIDATION_DIR || 'phase-5'}/`, import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [],
  checks = [],
  calls = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  if (r.url().includes('/v1/'))
    calls.push({ url: r.url(), body: r.postData(), headers: r.headers() });
});
const widget = (id) => page.locator(`[data-widget="${id}"]`);
async function all() {
  for (const w of await page.locator('[data-widget]').all()) {
    await w.scrollIntoViewIfNeeded();
    await expect(w).toHaveAttribute('data-fetching', 'false');
    await expect(w.getByText('불러오는 중…')).toHaveCount(0);
  }
}
async function shot(name) {
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: new URL(name + '.png', out).pathname, fullPage: true });
}
async function tab(name) {
  await page.getByRole('tab', { name, exact: true }).click();
  await all();
}
async function state(value) {
  await page.evaluate((v) => sessionStorage.setItem('pulsemetry.mockCase', v), value);
  await page.getByRole('button', { name: '새로고침', exact: true }).click();
  await all();
}
async function reason() {
  await page.getByRole('dialog').getByRole('textbox').fill('INC-2291 오류 발생 원인 확인');
  await page.getByRole('button', { name: '사유 기록 후 조회' }).click();
}
try {
  await page.goto('http://127.0.0.1:5173/operations');
  await page.getByRole('button', { name: 'owner 계정 입력' }).click();
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '운영 · 보안', exact: true })).toBeVisible();
  await all();
  await expect(widget('ops-tools')).toContainText('WebFetch');
  checks.push('Stability four charts and eight tools');
  await shot('stability-light');
  await writeFile(
    new URL('geometry.json', out),
    JSON.stringify(
      await page.locator('[data-widget]').evaluateAll((es) =>
        es.map((e) => {
          const r = e.getBoundingClientRect();
          return {
            id: e.getAttribute('data-widget'),
            x: r.x,
            y: r.y + scrollY,
            width: r.width,
            height: r.height,
          };
        }),
      ),
      null,
      2,
    ),
  );
  await expect(widget('ops-ttft').locator('.recharts-line')).toHaveCount(2);
  await page.getByRole('button', { name: '다크', exact: true }).click();
  await shot('stability-dark');
  await page.getByRole('button', { name: '라이트', exact: true }).click();
  await state('error');
  await expect(widget('ops-errors').getByText('쿼리에 실패했습니다')).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem('pulsemetry.mockCase', 'normal'));
  await widget('ops-errors').getByRole('button', { name: '재시도' }).click();
  await expect(widget('ops-errors').locator('.recharts-area')).toHaveCount(3);
  await state('empty');
  await expect(widget('ops-errors').getByText('이 기간에 관측된 데이터가 없습니다')).toBeVisible();
  await state('masked');
  await expect(widget('ops-errors').getByText('최소 집계 단위 미만')).toBeVisible();
  await state('normal');
  checks.push('TTFT percentile separation, widget error retry, empty and masked states');
  await tab('컴플라이언스');
  await expect(page.getByRole('heading', { name: '설치 커버리지' })).toBeVisible();
  await expect(page.getByText('***@pulsemetry.test').first()).toBeVisible();
  await page.getByRole('button', { name: '60일', exact: true }).click();
  await expect(page.getByText('4개 중 4개 표시')).toBeVisible();
  checks.push('Installations domain masking and inactivity filter');
  await page.getByRole('button', { name: '전체', exact: true }).click();
  await expect(page.getByText('12개 중 8개 표시')).toBeVisible();
  await shot('compliance');
  await state('partial');
  await expect(widget('ops-hooks').getByText('차단 조회 실패')).toBeVisible();
  await expect(widget('ops-hooks').locator('.recharts-bar')).toHaveCount(3);
  await state('normal');
  checks.push('Hook partial failure preserves execution bars');
  await tab('보안');
  await expect(widget('ops-refusals')).toContainText('cyber');
  await expect(widget('ops-mismatch')).toContainText('***@gmail.com');
  await shot('security');
  await page
    .getByLabel('부서', { exact: true })
    .selectOption('11111111-1111-4111-8111-111111111111');
  await all();
  expect(
    JSON.parse(
      calls
        .filter(
          (c) => c.body && JSON.parse(c.body).queries?.some((q) => q.metric_id === 'refusals'),
        )
        .at(-1).body,
    ).filters.team_ids,
  ).toEqual([]);
  await page.getByLabel('부서', { exact: true }).selectOption('');
  await all();
  checks.push('Organization refusal query excludes selected team');
  checks.push('Security refusal categories, mismatch, policy and rate limits');
  await tab('세션 조회(감사)');
  await expect(page.getByText('식별자를 입력해 세션을 조회하세요')).toBeVisible();
  const before = calls.filter((c) => c.url.includes('/events')).length;
  await page.getByLabel('세션 식별자').fill('sess_demo');
  await page.getByRole('button', { name: '조회 · 사유 입력', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: '사유 기록 후 조회' })).toBeDisabled();
  await page.getByRole('dialog').getByRole('textbox').fill('짧음');
  await expect(page.getByRole('button', { name: '사유 기록 후 조회' })).toBeDisabled();
  expect(calls.filter((c) => c.url.includes('/events')).length).toBe(before);
  await page.getByRole('dialog').getByRole('textbox').fill('INC-2291 오류 발생 원인 확인');
  await shot('audit-modal');
  await reason();
  await expect(page.getByRole('heading', { name: '세션 메타' })).toBeVisible();
  await expect(page.getByText('14건 중 8건')).toBeVisible();
  checks.push('No events before valid Korean audit reason');
  await shot('session-results');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByText('14건 중 6건')).toBeVisible();
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await expect(page.getByText('14건 중 8건')).toBeVisible();
  checks.push('Session opaque cursor pagination');
  await page.getByRole('button', { name: '조회 종료', exact: true }).click();
  await expect(page.getByRole('heading', { name: '세션 메타' })).toHaveCount(0);
  await page.evaluate(() => sessionStorage.setItem('pulsemetry.mockCase', 'loading'));
  await page.getByRole('button', { name: '조회 · 사유 입력', exact: true }).click();
  await reason();
  await page.getByRole('button', { name: '조회 취소', exact: true }).click();
  await page.waitForTimeout(2700);
  await expect(page.getByRole('heading', { name: '세션 메타' })).toHaveCount(0);
  await page.evaluate(() => sessionStorage.setItem('pulsemetry.mockCase', 'normal'));
  checks.push('Cancelled request cannot restore personal result');
  await page.getByLabel('세션 식별자').fill('missing');
  await page.getByRole('button', { name: '조회 · 사유 입력', exact: true }).click();
  await reason();
  await expect(page.getByText('세션을 찾을 수 없습니다.')).toBeVisible();
  checks.push('Close purges result and missing session error');
  await page.getByLabel('세션 식별자').fill('sess_demo');
  await page.getByRole('button', { name: '조회 · 사유 입력', exact: true }).click();
  await reason();
  await expect(page.getByRole('heading', { name: '세션 메타' })).toBeVisible();
  await page.getByRole('button', { name: '28d', exact: true }).click();
  await expect(page.getByRole('heading', { name: '세션 메타' })).toHaveCount(0);
  checks.push('Filter change purges personal result');
  await page.getByRole('link', { name: '설정', exact: true }).click();
  await expect(page.getByRole('heading', { name: '계약', exact: true })).toBeVisible();
  await all();
  await expect(page.getByRole('heading', { name: '계약', exact: true })).toBeVisible();
  await expect(page.getByText('80% (×0.8)')).toBeVisible();
  expect(calls.filter((c) => c.url.includes('/meta/members')).length).toBe(0);
  await shot('settings-locked');
  checks.push('Settings contracts multiplier and member audit gate');
  await page.getByRole('button', { name: '구성원 조회 · 사유 입력' }).click();
  await reason();
  await expect(page.getByText('12명 중 8명 조회')).toBeVisible();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByText('12명 중 4명 조회')).toBeVisible();
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await expect(page.getByText('12명 중 8명 조회')).toBeVisible();
  await page.getByLabel('현재 페이지 이메일 검색').fill('dev-0001');
  await expect(page.getByText('dev-0001@pulsemetry.test')).toBeVisible();
  await page.getByLabel('현재 페이지 이메일 검색').fill('');
  checks.push('Member audited pagination and current page search');
  await shot('settings-members');
  await page.getByRole('button', { name: '다크', exact: true }).click();
  await shot('settings-dark');
  await page.getByRole('button', { name: '라이트', exact: true }).click();
  for (const width of [1024, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    await shot('settings-' + width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  checks.push('Settings 1024 and 768 no overflow');
  await page.getByRole('link', { name: '운영 · 보안', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'API 에러율', exact: true })).toBeVisible();
  await all();
  await shot('operations-768');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  checks.push('Operations 768 no overflow');
  await page.getByRole('button', { name: '로그아웃' }).click();
  await page.getByRole('button', { name: 'admin 계정 입력' }).click();
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '접근 권한이 없습니다' })).toBeVisible();
  await page.getByRole('link', { name: '설정', exact: true }).click();
  await expect(page.getByText('구성원 이메일 목록은 owner 권한으로 제공됩니다.')).toBeVisible();
  await expect(page.getByRole('button', { name: '구성원 조회 · 사유 입력' })).toHaveCount(0);
  checks.push('Admin blocked from P3 and member identities');
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ checks: checks.length, errors }));
} finally {
  await writeFile(new URL('results.json', out), JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
}
