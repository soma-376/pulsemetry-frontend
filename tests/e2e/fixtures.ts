import { test as base, expect, type Response as PlaywrightResponse } from "@playwright/test";
import { ANNOTATION, PreparationError, probeRequests } from "./harness";

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

/** 시험이 기대하는 HTTP 오류 하나 — 상태, 경로(정규식), 메서드(생략하면 모두), 이유. */
export type AllowedHttpError = { status: number; path: RegExp; method?: string; reason: string };
/** 이 시험에서 앱이 받을 것을 기대하는 HTTP 오류를 밝힌다. 밝히지 않은 4xx·5xx 는 시험을 실패시킨다(429 는 reporter 가 따로 센다). */
export function allowHttpErrors(...rules: AllowedHttpError[]) {
  for (const rule of rules) {
    test.info().annotations.push({ type: ANNOTATION.allowedHttpError, description: JSON.stringify({ status: rule.status, path: rule.path.source, method: rule.method ?? null, reason: rule.reason }) });
  }
}

// 서버·인증 설정·시드의 선행 확인은 globalSetup(global-setup.ts)이 실행 전에 한 번 한다 — worker 마다 다시 로그인하지 않는다.
export const test = base.extend<{ browserErrors: void; rateLimitObserver: void; httpErrors: void }>({
  // 브라우저가 받은 429 를 테스트 주석으로 남긴다. reporter 가 기능 실패와 따로 세고, 429 를 시험하는 테스트는 ANNOTATION.intended429 를 단다.
  rateLimitObserver: [async ({ context }, use, testInfo) => {
    const listener = (response: PlaywrightResponse) => {
      if (response.status() === 429) testInfo.annotations.push({ type: ANNOTATION.observed429, description: `${response.request().method()} ${new URL(response.url()).pathname}` });
    };
    context.on("response", listener);
    await use();
    context.off("response", listener);
  }, { auto: true }],
  // 앱(브라우저)이 백엔드 두 서버와 프론트의 /api/ 에서 받은 4xx·5xx 를 모은다. 시험이 allowHttpErrors 로 밝힌 것과 시험 코드의 확인 요청은 뺀다.
  httpErrors: [async ({ context, page }, use, testInfo) => {
    const origins = new Set([new URL(enrollmentBase()).origin, new URL(dashboardBase()).origin]);
    const app = new URL(testInfo.project.use.baseURL!).origin;
    const seen: { method: string; path: string; status: number; url: string }[] = [];
    const listener = (response: PlaywrightResponse) => {
      const status = response.status();
      if (status < 400 || status === 429) return;
      const url = new URL(response.url());
      if (!origins.has(url.origin) && !(url.origin === app && url.pathname.startsWith("/api/"))) return;
      seen.push({ method: response.request().method(), path: url.pathname + url.search, status, url: url.origin + url.pathname + url.search });
    };
    context.on("response", listener);
    await use();
    context.off("response", listener);
    const probes = probeRequests.get(page) ?? new Set<string>();
    const allowed = testInfo.annotations.filter((a) => a.type === ANNOTATION.allowedHttpError)
      .map((a) => JSON.parse(a.description!) as { status: number; path: string; method: string | null });
    const unexpected = seen.filter((error) => !probes.has(`${error.method} ${error.url}`) &&
      !allowed.some((rule) => rule.status === error.status && new RegExp(rule.path).test(error.path) && (!rule.method || rule.method === error.method)))
      .map(({ method, path, status }) => `${status} ${method} ${path}`);
    expect(unexpected, "앱이 받은 기대하지 않은 HTTP 오류 — 기대한다면 allowHttpErrors 로 이유와 함께 밝힌다").toEqual([]);
  }, { auto: true }],
  browserErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await use();
    expect(errors, "브라우저 런타임 오류").toEqual([]);
  }, { auto: true }],
});
export { expect };
