import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import {
  completedOnboarding,
  fixtureOrg,
  fixtureUser,
} from "./session-fixture";
import { overviewFixture, settingsFixture } from "./overview-fixture";

// 실제 Next/BFF/브라우저 + 테스트 전용 인증·업무 서버. 실제 Cognito/DB는 사용하지 않는다.
const appOrigin = "http://localhost:3107";
let server: Server;
let active = false;
let session = 0;
const events: { path: string; status: number; session: number }[] = [];
const codes = new Map<string, { challenge: string; redirect: string }>();

test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://localhost:3110");
    const path = url.pathname;
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const json = (data: unknown, status = 200) => {
      events.push({ path, status, session });
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (path === "/api/v1/auth/organizations")
      return json({
        organizations: [
          { organizationId: fixtureOrg, organizationName: "복구 검증 회사" },
        ],
      });
    if (path === "/api/v1/auth/oidc/authorize") {
      const redirect = url.searchParams.get("redirect_uri")!;
      if (redirect !== `${appOrigin}/auth/callback`) return json({}, 400);
      const code = `uac_${randomBytes(32).toString("base64url")}`;
      codes.set(code, {
        challenge: url.searchParams.get("code_challenge")!,
        redirect,
      });
      const target = new URL(redirect);
      target.searchParams.set("code", code);
      target.searchParams.set("state", url.searchParams.get("state")!);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      // 신원 확인을 대체하는 명시적 테스트 화면. 비밀번호는 수집하지 않는다.
      return res.end(
        `<h1>모의 회사 인증</h1><a href="${target.toString().replaceAll("&", "&amp;")}">테스트 인증 완료</a>`,
      );
    }
    if (path === "/api/v1/auth/token") {
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const pending = codes.get(body.code);
      codes.delete(body.code);
      if (
        !pending ||
        pending.redirect !== body.redirect_uri ||
        pending.challenge !==
          createHash("sha256").update(body.code_verifier).digest("base64url")
      )
        return json({}, 401);
      session++;
      active = true;
      return json({
        access_token: `recovery-at-${session}`,
        refresh_token: `recovery-rt-${session}`,
        token_type: "Bearer",
        expires_in: 300,
      });
    }
    if (path === "/api/v1/auth/logout") {
      // BFF는 새 로그인 교환 후 이전 쿠키의 세션을 폐기할 수 있다.
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (body.refresh_token === `recovery-rt-${session}`) active = false;
      events.push({ path, status: 204, session });
      res.writeHead(204);
      return res.end();
    }
    if (path === "/api/v1/auth/refresh") return json({}, 401);
    if (
      !active ||
      req.headers.authorization !== `Bearer recovery-at-${session}`
    )
      return json({}, 401);
    if (path === "/api/v1/auth/me") return json(fixtureUser);
    if (path.endsWith("/onboarding")) return json(completedOnboarding);
    if (path.endsWith("/analytics/overview"))
      return json(overviewFixture(url.toString()));
    if (path.endsWith("/settings")) return json(settingsFixture());
    if (path.endsWith("/ingest-status"))
      return json({
        organizationId: fixtureOrg,
        status: "healthy",
        reason: null,
        asOf: new Date().toISOString(),
        lastReceivedAt: new Date().toISOString(),
      });
    if (path.endsWith("/contract-input-status"))
      return json({
        organizationId: fixtureOrg,
        asOf: new Date().toISOString(),
        requiredCount: 0,
        vendors: [],
        expiredCount: 0,
        expiredContracts: [],
      });
    if (path.endsWith("/alerts"))
      return json({
        meta: {
          organizationId: fixtureOrg,
          snapshotId: "recovery",
          asOf: new Date().toISOString(),
        },
        evaluation: { status: "complete", reasons: [], asOf: null },
        alerts: { items: [], totalCount: 0, nextCursor: null },
      });
    return json({}, 404);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(3110, "127.0.0.1", resolve);
  });
});

test.afterAll(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
});

async function login(page: Page) {
  await page.getByLabel("회사 이메일", { exact: true }).fill(fixtureUser.email);
  await page
    .getByRole("button", { name: "회사 계정으로 계속", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "모의 회사 인증" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "테스트 인증 완료" }).click();
  await expect(page).toHaveURL(/\/overview(?:\?.*)?$/);
  await expect(
    page.getByRole("region", { name: "사용 환산액", exact: true }),
  ).toContainText("$5,000.00");
}

test("세션 폐기 후 로그인 화면과 재로그인을 거쳐 실제 BFF 조회를 복구한다", async ({
  page,
  context,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  await login(page);
  const old = (await context.cookies()).find(
    (cookie) => cookie.name === "pulsemetry-session",
  )!;
  expect(old.httpOnly).toBe(true);
  expect(session).toBe(1);
  await page.screenshot({ path: info.outputPath("01-authenticated.png") });

  // 재사용 탐지 등으로 서버 세션이 이미 폐기된 상태를 주입한다. 쿠키는 삭제하지 않는다.
  active = false;
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "회사 계정으로 로그인" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "사용 환산액", exact: true }),
  ).toHaveCount(0);
  expect(
    (await context.cookies()).find(
      (cookie) => cookie.name === "pulsemetry-session",
    )?.value,
  ).toBe(old.value);
  await page.screenshot({ path: info.outputPath("02-login-required.png") });
  // 폐기 쿠키가 남아 있어도 새로고침 후 보호 화면과 로그인 사이를 순환하지 않는다.
  await page.reload();
  await expect(page.getByLabel("회사 이메일", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  await login(page);
  expect(session).toBe(2);
  const renewed = (await context.cookies()).find(
    (cookie) => cookie.name === "pulsemetry-session",
  )!;
  expect(renewed.httpOnly).toBe(true);
  expect(renewed.value).not.toBe(old.value);
  const count = events.filter(
    (event) =>
      event.path.endsWith("/analytics/overview") &&
      event.session === 2 &&
      event.status === 200,
  ).length;
  expect(count).toBeGreaterThan(0);
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect
    .poll(
      () =>
        events.filter(
          (event) =>
            event.path.endsWith("/analytics/overview") &&
            event.session === 2 &&
            event.status === 200,
        ).length,
    )
    .toBeGreaterThan(count);
  await expect(
    page.getByRole("region", { name: "사용 환산액", exact: true }),
  ).toContainText("$5,000.00");
  await page.screenshot({ path: info.outputPath("03-recovered.png") });
  expect(
    events.some(
      (event) =>
        event.path.endsWith("/analytics/overview") && event.status === 401,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await info.attach("upstream-events", {
    body: JSON.stringify(events, null, 2),
    contentType: "application/json",
  });
});
