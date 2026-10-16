import { expect, test, type Route } from "@playwright/test";
import { openDashboard } from "./helpers";
import {
  fixtureCandidates,
  fixtureMembers,
  mockMembers,
} from "./members-fixture";

const members = fixtureMembers();

/**
 * 회수 확인 모달 → 실행 → 관리자 조치 확인 → 복원 → 확인(서버 명세 enrollment §12 "좌석 회수·복원"). 서버 응답은 메모리 흉내다 —
 * 실제 서버 검증은 tests/e2e/seats.spec.ts 가 한다. 조치 대기는 완료가 아니고, 결과는 작업 조회로만 바뀐다.
 */
test("admin-action reclaim stays awaiting until confirmed, then restores through the same flow", async ({
  page,
}) => {
  const api = await mockMembers(page, { reclaimable: true });
  const candidate = fixtureCandidates(members)[0];
  const seat = "seat-1";
  const operations = new Map<string, Record<string, unknown>>();
  const op = (
    id: string,
    kind: string,
    status: string,
    target: Record<string, unknown>,
    canRestore = false,
  ) => {
    const value = {
      operationId: id,
      kind,
      status,
      createdAt: "2026-09-22T00:00:00Z",
      completedAt: ["succeeded", "failed"].includes(status)
        ? "2026-09-22T00:01:00Z"
        : null,
      results: [{ targetId: seat, reason: null, action: null, ...target }],
      canRestore,
      restoreUntil: kind === "seat_reclaim" ? "2026-10-22T00:00:00Z" : null,
      retention: null,
    };
    operations.set(id, value);
    return value;
  };
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers":
      "content-type,authorization,idempotency-key",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  };
  const json = (route: Route, value: unknown, status = 200) =>
    route.fulfill({ status, headers: cors, json: value });
  const posted: { path: string; body: unknown; key: string | undefined }[] = [];
  await page.route(
    (url) =>
      /\/api\/v1\/organizations\/[^/]+\/(seat-reclaims|operations)(\/|$)/.test(
        url.pathname,
      ),
    (route) => {
      const request = route.request();
      if (request.method() === "OPTIONS")
        return route.fulfill({ status: 204, headers: cors });
      const path = new URL(request.url()).pathname
        .split("/organizations/")[1]
        .split("/")
        .slice(1)
        .join("/");
      if (request.method() === "GET")
        return json(route, operations.get(path.split("/")[1]));
      posted.push({
        path,
        body: request.postDataJSON(),
        key: request.headers()["idempotency-key"],
      });
      if (path === "seat-reclaims/preview")
        return json(route, {
          previewId: "preview-1",
          expiresAt: "2026-09-22T00:05:00Z",
          eligibleSeatAssignmentIds: [seat],
          rejected: [],
          estimatedMonthlySavingsUsd: "20",
          savingsEffectiveAt: null,
          resultingUnallocatedSeats: 6,
          savingsBasis: "contract_unit_price",
          targets: [
            {
              seatAssignmentId: seat,
              vendorId: "vendor-1",
              method: "admin_action",
            },
          ],
        });
      if (path === "seat-reclaims") {
        api.seatControls.set(seat, {
          operationId: "op-reclaim",
          kind: "seat_reclaim",
        });
        return json(
          route,
          op("op-reclaim", "seat_reclaim", "awaiting_admin_action", {
            status: "awaiting_admin_action",
            action: "release_in_vendor_console",
          }),
          202,
        );
      }
      if (path === `operations/op-reclaim/targets/${seat}/confirm`) {
        api.seatStates.set(seat, "released");
        return json(
          route,
          op(
            "op-reclaim",
            "seat_reclaim",
            "succeeded",
            { status: "succeeded", action: "release_in_vendor_console" },
            true,
          ),
        );
      }
      if (path === "seat-reclaims/op-reclaim/restore") {
        api.seatControls.set(seat, {
          operationId: "op-restore",
          kind: "seat_restore",
        });
        op(
          "op-reclaim",
          "seat_reclaim",
          "succeeded",
          { status: "succeeded", action: "release_in_vendor_console" },
          false,
        );
        return json(
          route,
          op("op-restore", "seat_restore", "awaiting_admin_action", {
            status: "awaiting_admin_action",
            action: "restore_in_vendor_console",
          }),
          202,
        );
      }
      if (path === `operations/op-restore/targets/${seat}/confirm`) {
        api.seatStates.set(seat, "assigned");
        return json(
          route,
          op("op-restore", "seat_restore", "succeeded", {
            status: "succeeded",
            action: "restore_in_vendor_console",
          }),
        );
      }
      return json(
        route,
        { error: { code: "not_found", message: "fixture" } },
        404,
      );
    },
  );
  await openDashboard(page, "/members");
  await page
    .getByRole("region", { name: "좌석 회수 후보", exact: true })
    .getByRole("button", {
      name: `${candidate.account} 좌석 상세`,
      exact: true,
    })
    .click();
  const drawer = page.getByRole("dialog", { name: "구성원 상세", exact: true });
  await drawer.getByRole("button", { name: "벤더 좌석", exact: true }).click();
  await drawer
    .getByRole("button", { name: `Claude ${candidate.account} 좌석 회수` })
    .click();

  const modal = page.getByRole("dialog", {
    name: "좌석 회수 확인",
    exact: true,
  });
  await expect(modal).toContainText("벤더 콘솔에서 직접 해지 후 확인");
  await expect(modal).toContainText("$20.00");
  await expect(modal).toContainText("6석");
  await expect(modal).toContainText("계약 수량을 줄여야 실현");
  await modal.getByRole("button", { name: "회수 실행" }).click();
  const reclaim = modal.getByRole("region", { name: "좌석 회수 작업" });
  // 조치 대기는 완료가 아니다 — 콘솔에서 할 일과 확인을 보여 준다.
  await expect(reclaim.getByRole("status")).toContainText("관리자 조치 대기");
  await expect(reclaim).toContainText("벤더 관리 콘솔에서 이 계정의 좌석");
  await reclaim.getByRole("button", { name: "해지 완료 확인" }).click();
  await expect(reclaim.getByRole("status")).toContainText("회수 · 완료");
  await reclaim.getByRole("button", { name: "복원" }).click();
  const restore = modal.getByRole("region", { name: "좌석 복원 작업" });
  await expect(restore.getByRole("status")).toContainText("관리자 조치 대기");
  await restore.getByRole("button", { name: "배정 완료 확인" }).click();
  await expect(restore.getByRole("status")).toContainText("복원 · 완료");

  expect(posted.map((item) => item.path)).toEqual([
    "seat-reclaims/preview",
    "seat-reclaims",
    `operations/op-reclaim/targets/${seat}/confirm`,
    "seat-reclaims/op-reclaim/restore",
    `operations/op-restore/targets/${seat}/confirm`,
  ]);
  expect(posted[0].body).toEqual({
    seats: [{ seatAssignmentId: seat, expectedVersion: 1 }],
  });
  expect(posted[1].body).toEqual({ previewId: "preview-1" });
  expect(
    posted.every((item) => /^[A-Za-z0-9_-]{8,128}$/.test(item.key ?? "")),
  ).toBe(true);

  // 모달을 닫아도 그 좌석의 최근 작업을 상세에서 다시 찾는다.
  await modal.getByRole("button", { name: "닫기" }).last().click();
  await expect(
    drawer.getByRole("region", { name: "좌석 복원 작업" }),
  ).toBeVisible();
});

for (const conflict of [
  "preview_stale",
  "preview_expired",
  "version_conflict",
] as const) {
  test(`reclaim ${conflict} retry reads the latest seat before creating a new preview`, async ({
    page,
  }) => {
    const api = await mockMembers(page, { reclaimable: true });
    const candidate = fixtureCandidates(members)[0];
    const versions: number[] = [];
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers":
        "content-type,authorization,idempotency-key",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    };
    await page.route(/\/seat-reclaims(?:\/preview)?$/, async (route) => {
      if (route.request().method() === "OPTIONS")
        return route.fulfill({ status: 204, headers: cors });
      const path = new URL(route.request().url()).pathname;
      if (!path.endsWith("/preview"))
        return route.fulfill({
          status: 409,
          headers: cors,
          json: { error: { code: conflict, message: conflict } },
        });
      const version = route.request().postDataJSON().seats[0]
        .expectedVersion as number;
      versions.push(version);
      // Another administrator changes the seat after the initial list read.
      // Initial preview conflicts too when the change preceded opening the modal.
      const accepted = version === (api.seatVersions.get("seat-1") ?? 1);
      return route.fulfill({
        headers: cors,
        json: {
          previewId: `preview-${versions.length}`,
          expiresAt: "2026-09-22T00:05:00Z",
          eligibleSeatAssignmentIds: accepted ? ["seat-1"] : [],
          rejected: accepted
            ? []
            : [{ seatAssignmentId: "seat-1", reason: "version_conflict" }],
          estimatedMonthlySavingsUsd: accepted ? "20" : null,
          savingsEffectiveAt: null,
          resultingUnallocatedSeats: accepted ? 6 : null,
          savingsBasis: "contract_unit_price",
          targets: accepted
            ? [
                {
                  seatAssignmentId: "seat-1",
                  vendorId: "vendor-1",
                  method: "admin_action",
                },
              ]
            : [],
        },
      });
    });
    await openDashboard(page, "/members");
    await page
      .getByRole("region", { name: "좌석 회수 후보", exact: true })
      .getByRole("button", {
        name: `${candidate.account} 좌석 상세`,
        exact: true,
      })
      .click();
    const drawer = page.getByRole("dialog", {
      name: "구성원 상세",
      exact: true,
    });
    await drawer
      .getByRole("button", { name: "벤더 좌석", exact: true })
      .click();
    const reclaim = drawer.getByRole("button", {
      name: `Claude ${candidate.account} 좌석 회수`,
    });
    await expect(reclaim).toBeVisible();
    if (conflict === "version_conflict") api.seatVersions.set("seat-1", 2);
    await reclaim.click();
    const modal = page.getByRole("dialog", {
      name: "좌석 회수 확인",
      exact: true,
    });
    if (conflict !== "version_conflict") {
      await expect(
        modal.getByRole("button", { name: "회수 실행" }),
      ).toBeEnabled();
      api.seatVersions.set("seat-1", 2);
      await modal.getByRole("button", { name: "회수 실행" }).click();
    }
    await expect(
      modal.getByRole("button", { name: "회수 실행" }),
    ).toBeDisabled();
    if (conflict === "preview_stale") {
      // A failed fresh-ledger read must not re-enable the old preview.
      const seatPath = new RegExp(`/members/${candidate.memberId}/seats$`);
      await page.route(seatPath, (route) =>
        route.request().method() === "OPTIONS"
          ? route.fulfill({ status: 204, headers: cors })
          : route.fulfill({
              status: 422,
              headers: cors,
              json: { error: { code: "unavailable", message: "fixture" } },
            }),
      );
      await modal.getByRole("button", { name: "다시 조회" }).click();
      await expect(modal.getByRole("alert")).toBeVisible();
      await expect(
        modal.getByRole("button", { name: "다시 조회" }),
      ).toBeEnabled();
      await expect(
        modal.getByRole("button", { name: "회수 실행" }),
      ).toBeDisabled();
      expect(versions).toEqual([1]);
      await page.unroute(seatPath);
    }
    await modal.getByRole("button", { name: "다시 조회" }).click();
    await expect(
      modal.getByRole("button", { name: "회수 실행" }),
    ).toBeEnabled();
    await expect(modal).toContainText("$20.00");
    expect(versions).toEqual([1, 2]);
  });
}

for (const terminal of ["succeeded", "partially_failed"] as const) {
  test(`vendor operation polling ${terminal} refreshes the seat ledger without reloading`, async ({
    page,
  }) => {
    const api = await mockMembers(page, { reclaimable: true });
    const candidate = fixtureCandidates(api.members)[0];
    const seat = "seat-1";
    api.seatControls.set(seat, {
      operationId: "op-vendor-poll",
      kind: "seat_reclaim",
    });
    let finish = false;
    let seatReads = 0;
    page.on("request", (request) => {
      if (
        request.method() === "GET" &&
        request.url().endsWith(`/members/${candidate.memberId}/seats`)
      )
        seatReads++;
    });
    await page.route("**/operations/op-vendor-poll", (route) => {
      if (finish) {
        api.seatStates.set(seat, "released");
        api.seatVersions.set(seat, 2);
      }
      return route.fulfill({
        headers: finish ? {} : { "Retry-After": "1" },
        json: {
          operationId: "op-vendor-poll",
          kind: "seat_reclaim",
          status: finish ? terminal : "running",
          createdAt: "2026-10-16T00:00:00Z",
          completedAt: finish ? "2026-10-16T00:00:25Z" : null,
          results: [
            {
              targetId: seat,
              status: finish ? "succeeded" : "pending",
              reason: null,
              action: null,
            },
            ...(terminal === "partially_failed"
              ? [
                  {
                    targetId: "seat-2",
                    status: "failed",
                    reason: "vendor_rejected",
                    action: null,
                  },
                ]
              : []),
          ],
          canRestore: finish,
          restoreUntil: finish ? "2026-10-17T00:00:25Z" : null,
          retention: null,
        },
      });
    });
    await openDashboard(page, "/members");
    await page
      .getByRole("region", { name: "좌석 회수 후보", exact: true })
      .getByRole("button", {
        name: `${candidate.account} 좌석 상세`,
        exact: true,
      })
      .click();
    const drawer = page.getByRole("dialog", {
      name: "구성원 상세",
      exact: true,
    });
    await drawer
      .getByRole("button", { name: "벤더 좌석", exact: true })
      .click();
    const card = drawer.locator(`[data-seat-id="${seat}"]`);
    const operation = card.getByRole("region", { name: "좌석 회수 작업" });
    await expect(operation.getByRole("status")).toContainText("벤더 처리 중");
    await expect(card.getByText("배정", { exact: true })).toBeVisible();
    const before = seatReads;
    finish = true;
    await expect(operation.getByRole("status")).toContainText(
      terminal === "succeeded" ? "회수 · 완료" : "회수 · 일부 실패",
    );
    await expect.poll(() => seatReads).toBeGreaterThan(before);
    await expect(card.getByText("해제", { exact: true })).toBeVisible();
    await expect(card.getByText("배정", { exact: true })).toHaveCount(0);
    await expect(card).not.toContainText("회수할 수 없음");
  });
}
