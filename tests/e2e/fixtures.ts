import { test as base, expect, type Response as PlaywrightResponse } from "@playwright/test";
import { ANNOTATION, PreparationError } from "./harness";

export const seedOrganizations = [
  { seed: "a", id: "1b59ab21-1788-35e0-bfd7-23baa88a35b4", name: "시드 A · 정상 사용" },
  { seed: "b", id: "db1c8c6b-6970-38c6-821a-eb5e61b7a180", name: "시드 B · 신규 조직" },
  { seed: "c", id: "4769355c-a20e-327f-89fc-fef69e94dfb6", name: "시드 C · 예외 데이터" },
] as const;

function localBase(value: string) {
  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password) throw new PreparationError("시드 E2E는 로컬 백엔드 주소를 사용해야 합니다.");
  return value.replace(/\/$/, "");
}
export const enrollmentBase = () => localBase(process.env.NEXT_PUBLIC_ENROLLMENT_API_URL ?? "http://localhost:8080");
export const dashboardBase = () => localBase(process.env.NEXT_PUBLIC_DASHBOARD_API_URL ?? "http://localhost:8081");

// 서버·인증 설정·시드의 선행 확인은 globalSetup(global-setup.ts)이 실행 전에 한 번 한다 — worker 마다 다시 로그인하지 않는다.
export const test = base.extend<{ browserErrors: void; rateLimitObserver: void }>({
  // 브라우저가 받은 429 를 테스트 주석으로 남긴다. reporter 가 기능 실패와 따로 세고, 429 를 시험하는 테스트는 ANNOTATION.intended429 를 단다.
  rateLimitObserver: [async ({ context }, use, testInfo) => {
    const listener = (response: PlaywrightResponse) => {
      if (response.status() === 429) testInfo.annotations.push({ type: ANNOTATION.observed429, description: `${response.request().method()} ${new URL(response.url()).pathname}` });
    };
    context.on("response", listener);
    await use();
    context.off("response", listener);
  }, { auto: true }],
  browserErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await use();
    expect(errors, "브라우저 런타임 오류").toEqual([]);
  }, { auto: true }],
});
export { expect };
