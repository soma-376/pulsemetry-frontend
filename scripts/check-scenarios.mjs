import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = new URL(
  `../docs/validation/${process.env.VALIDATION_DIR || 'phase-6'}/`,
  import.meta.url,
);
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [],
  checks = [],
  calls = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  if (r.url().includes('/v1/scenario'))
    calls.push({ url: r.url(), method: r.method(), body: r.postData() });
});
const dialog = () => page.getByRole('dialog');
async function shot(name) {
  await page.screenshot({ path: new URL(`${name}.png`, out).pathname, fullPage: true });
}
async function mode(v) {
  await page.evaluate((v) => sessionStorage.setItem('pulsemetry.mockCase', v), v);
}
async function open(id) {
  await page
    .locator('button')
    .filter({ has: page.locator('code', { hasText: new RegExp(`^★? ?${id}$`) }) })
    .first()
    .click();
  await expect(dialog().getByRole('heading', { name: '이 질문에 답하는 지표' })).toBeVisible();
}
async function close() {
  if (new URL(page.url()).pathname.startsWith('/runs/')) {
    await page.getByRole('link', { name: '시나리오', exact: true }).click();
    await expect(page.locator('#catalog')).toBeVisible();
    return;
  }
  await dialog().getByRole('button', { name: '드로어 닫기' }).click();
  await expect(dialog()).toHaveCount(0);
}
try {
  await page.goto('http://127.0.0.1:5173/scenarios');
  await page.getByRole('button', { name: 'owner 계정 입력' }).click();
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '질문을 골라 시작하세요' })).toBeVisible();
  await shot('welcome');
  await page.getByRole('button', { name: '전체 46개 질문 보기' }).click();
  checks.push('First visit and 46 item catalog');
  await expect(page.locator('[data-availability]')).toHaveCount(10);
  await shot('catalog-light');
  await writeFile(
    new URL('geometry.json', out),
    JSON.stringify(await page.locator('[data-availability]').first().boundingBox(), null, 2),
  );
  await page.getByRole('searchbox', { name: '시나리오 검색' }).fill('없는 질문');
  await expect(page.getByText('검색 결과가 없습니다.')).toBeVisible();
  await page.getByRole('searchbox', { name: '시나리오 검색' }).fill('S5-1');
  await open('S5-1');
  await expect(dialog().getByText('이 시나리오는 아직 실행할 수 없습니다.')).toBeVisible();
  await expect(dialog().getByRole('button', { name: '실행', exact: true })).toHaveCount(0);
  await shot('unavailable');
  await close();
  checks.push('Search and unavailable gate');
  await page.getByRole('searchbox', { name: '시나리오 검색' }).fill('');
  await open('S1-3');
  await shot('cost-drawer');
  await dialog().getByLabel('이동평균 일수', { exact: true }).fill('0');
  await expect(dialog().getByRole('button', { name: '실행', exact: true })).toBeDisabled();
  await dialog().getByRole('button', { name: '기본값으로' }).click();
  await mode('loading');
  await dialog().getByRole('button', { name: '실행', exact: true }).click();
  await expect(dialog().getByRole('button', { name: '백그라운드로 두기' })).toBeVisible();
  await shot('running');
  await dialog().getByRole('button', { name: '백그라운드로 두기' }).click();
  await page.getByRole('link', { name: '팀 분석', exact: true }).click();
  await page.getByRole('link', { name: '시나리오', exact: true }).click();
  await page.locator('button').filter({ hasText: 'S1-3 비용 스파이크' }).last().click();
  await expect(dialog().getByRole('button', { name: '실행 취소' })).toBeVisible();
  await expect(dialog().getByRole('button', { name: '실행 취소' })).toBeEnabled();
  await dialog().getByRole('button', { name: '실행 취소' }).click();
  await expect(dialog().getByRole('heading', { name: '취소됨 · S1-3' })).toBeVisible();
  await close();
  checks.push('Validation, background route persistence and cancellation');
  await mode('normal');
  await open('S1-1');
  await expect(dialog().getByRole('button', { name: '실행', exact: true })).toBeDisabled();
  await dialog().getByLabel('결제 usd', { exact: true }).fill('2000');
  await dialog().getByLabel('결제 tokens_m', { exact: true }).fill('10');
  await expect(dialog().getByRole('button', { name: '실행', exact: true })).toBeDisabled();
  await dialog().getByLabel('결제 tokens_m', { exact: true }).fill('');
  await expect(dialog().getByRole('button', { name: '실행', exact: true })).toBeEnabled();
  await shot('budget-drawer');
  await dialog().getByRole('button', { name: '실행', exact: true }).click();
  await expect(page.getByRole('heading', { name: '판정 · findings' })).toBeVisible({
    timeout: 15000,
  });
  const count = calls.filter((c) => c.method === 'GET' && c.url.includes('/scenario-runs/')).length;
  await page.waitForTimeout(2300);
  expect(calls.filter((c) => c.method === 'GET' && c.url.includes('/scenario-runs/')).length).toBe(
    count,
  );
  await shot('succeeded');
  await close();
  checks.push('Budget exclusive units, queued to success, terminal polling stopped');
  await mode('run-failed');
  await open('S1-3');
  await dialog().getByRole('button', { name: '실행', exact: true }).click();
  await expect(dialog().getByRole('heading', { name: '실패 · S1-3' })).toBeVisible({
    timeout: 15000,
  });
  await expect(dialog()).toContainText('mock-run-timeout');
  await shot('failed');
  await mode('normal');
  await dialog().getByRole('button', { name: '재실행', exact: true }).click();
  await expect(page.getByRole('heading', { name: '판정 · findings' })).toBeVisible({
    timeout: 15000,
  });
  await close();
  checks.push('Failed run and explicit retry');
  await mode('loading');
  await open('S1-3');
  await dialog().getByRole('button', { name: '실행', exact: true }).click();
  await page.evaluate(() => {
    const original = window.fetch;
    window.__originalScenarioFetch = original;
    window.fetch = (input, init) =>
      String(input).includes('/scenario-runs/') && (!init?.method || init.method === 'GET')
        ? Promise.resolve(
            new Response(JSON.stringify({ message: '상태 조회 일시 실패' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            }),
          )
        : original(input, init);
  });
  await expect(dialog()).toContainText('상태 확인 필요', { timeout: 7000 });
  await page.evaluate(() => {
    window.fetch = window.__originalScenarioFetch;
  });
  await dialog().getByRole('button', { name: '상태 재확인' }).click();
  await expect(dialog().getByRole('button', { name: '실행 취소' })).toBeEnabled();
  await dialog().getByRole('button', { name: '실행 취소' }).click();
  await expect(dialog().getByRole('heading', { name: '취소됨 · S1-3' })).toBeVisible();
  await close();
  checks.push('Polling failure pauses with recoverable state and cancellation');
  for (let i = 0; i < 3; i++) {
    await open('S1-3');
    await dialog().getByRole('button', { name: '실행', exact: true }).click();
    await dialog().getByRole('button', { name: '백그라운드로 두기' }).click();
  }
  await open('S1-3');
  await dialog().getByRole('button', { name: '실행', exact: true }).click();
  await expect(dialog().getByRole('alert')).toContainText('동시에 3개');
  await close();
  for (let i = 0; i < 3; i++) {
    await page
      .locator('aside button')
      .filter({ hasText: /S1-3/ })
      .filter({ hasText: /대기|실행 중/ })
      .first()
      .click();
    await expect(dialog().getByRole('button', { name: '실행 취소' })).toBeEnabled();
    await dialog().getByRole('button', { name: '실행 취소' }).click();
    await expect(dialog().getByRole('heading', { name: '취소됨 · S1-3' })).toBeVisible();
    await close();
  }
  checks.push('Concurrent three-run limit surfaced and all runs cancelled');
  await mode('normal');
  await page.getByRole('button', { name: '다크', exact: true }).click();
  await shot('catalog-dark');
  await page.getByRole('button', { name: '라이트', exact: true }).click();
  for (const width of [1024, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await shot(`viewport-${width}`);
  }
  checks.push('Dark and 1024/768 no document overflow');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await page.getByRole('button', { name: 'admin 계정 입력' }).click();
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.getByRole('link', { name: '시나리오', exact: true }).click();
  await expect(page.getByText('아직 실행한 질문이 없습니다.')).toBeVisible();
  await page.getByRole('searchbox', { name: '시나리오 검색' }).fill('S5-7');
  await open('S5-7');
  await expect(dialog().getByText('owner 권한이 필요합니다.')).toBeVisible();
  await close();
  await page.getByRole('searchbox', { name: '시나리오 검색' }).fill('S1-3');
  await open('S1-3');
  await expect(dialog().getByText('플랫폼', { exact: true })).toHaveCount(0);
  await close();
  checks.push('Logout clears run state, admin team scope and owner result restriction');
  expect(errors).toEqual([]);
} finally {
  await writeFile(new URL('results.json', out), JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ checks, errors }, null, 2));
