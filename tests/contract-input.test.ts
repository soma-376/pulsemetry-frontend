import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExpiredContracts } from "../src/components/alerts/ExpiredContracts";
import { NotificationBell } from "../src/components/layout/NotificationBell";
import { FiltersProvider } from "../src/lib/filters";
import { alertsOptions } from "../src/lib/api/alerts";
import { renderInRouter } from "./support/render-in-router";
import example from "../docs/api/contract-input-status-response.example.json";
import {
  contractInputStatusSchema,
  contractInputText,
  contractInputStatusOptions,
  fetchContractInputStatus,
} from "../src/lib/api/contract-input";

test("계약 상태 조회는 조직별로 구분하고 잘못된 건수와 다른 조직 응답을 거부한다", async () => {
  const response = {
    organizationId: "org-a",
    asOf: "2026-10-12T00:00:00Z",
    requiredCount: 1,
    expiredCount: 1,
    expiredContracts: [
      {
        vendorId: "expired-vendor",
        displayName: "Expired vendor",
        endDate: "2026-10-11",
      },
    ],
    vendors: [
      {
        vendorId: "vendor-a",
        displayName: "Vendor",
        missingFields: ["planId", "seats", "monthlyFeePerSeatUsd"],
      },
    ],
  };
  assert.equal(
    contractInputStatusSchema.safeParse({ ...response, requiredCount: 0 })
      .success,
    false,
  );
  assert.notDeepEqual(
    contractInputStatusOptions("org-a").queryKey,
    contractInputStatusOptions("org-b").queryKey,
  );
  const original = global.fetch;
  global.fetch = async (url) => {
    assert.match(String(url), /organizations\/org-a\/contract-input-status$/);
    return Response.json(response);
  };
  try {
    assert.deepEqual(await fetchContractInputStatus("org-a"), response);
    global.fetch = async () =>
      Response.json({ ...response, organizationId: "org-b" });
    await assert.rejects(fetchContractInputStatus("org-a"));
    global.fetch = async () =>
      Response.json(
        { error: { code: "unavailable", message: "unavailable" } },
        { status: 503 },
      );
    await assert.rejects(fetchContractInputStatus("org-a"));
  } finally {
    global.fetch = original;
  }
  assert.equal(
    contractInputText(["seats", "monthlyFeePerSeatUsd"]),
    "좌석 수 · 월 좌석 단가 입력 필요",
  );
});

test("만료 계약의 건수·중복·날짜가 잘못되면 정상 안내로 표시하지 않는다", () => {
  assert.deepEqual(contractInputStatusSchema.parse(example), example);
  const contract = {
    vendorId: "v",
    displayName: "Vendor",
    endDate: "2026-10-11",
  };
  const response = {
    organizationId: "org-a",
    asOf: "2026-10-12T00:00:00Z",
    requiredCount: 0,
    vendors: [],
    expiredCount: 1,
    expiredContracts: [contract],
  };
  assert.equal(contractInputStatusSchema.safeParse(response).success, true);
  for (const invalid of [
    { ...response, expiredCount: 0 },
    { ...response, expiredCount: 2, expiredContracts: [contract, contract] },
    { ...response, expiredContracts: [{ ...contract, endDate: "2026-02-30" }] },
    { ...response, expiredCount: undefined, expiredContracts: undefined },
  ])
    assert.equal(contractInputStatusSchema.safeParse(invalid).success, false);
});

test("만료 안내는 해당 계약 폼 링크와 종료일을 표시하고 확인 처리를 제공하지 않는다", () => {
  const html = renderInRouter(
    createElement(ExpiredContracts, {
      contracts: [
        {
          vendorId: "vendor/a?x=1",
          displayName: "벤더 A",
          endDate: "2026-10-11",
        },
      ],
      onNavigate() {},
    }),
  );
  assert.match(html, /만료된 계약이 있습니다/);
  assert.match(html, /href="\/settings\?vendor=vendor%2Fa%3Fx%3D1"/);
  assert.match(html, /dateTime="2026-10-11"/);
  assert.match(html, /계약 갱신/);
  assert.doesNotMatch(html, /<button/);
  assert.equal(
    renderInRouter(
      createElement(ExpiredContracts, { contracts: [], onNavigate() {} }),
    ),
    "",
  );
});

test("알림 종은 미확인 알림과 만료 계약을 합산하고 조회 전·실패를 0건으로 표시하지 않는다", () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const key = contractInputStatusOptions("org-a").queryKey;
  const render = () =>
    renderInRouter(
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          FiltersProvider,
          null,
          createElement(NotificationBell, { organizationId: "org-a" }),
        ),
      ),
    );
  client.setQueryData(alertsOptions("org-a", "unacknowledged").queryKey, {
    pages: [
      {
        meta: {
          organizationId: "org-a",
          asOf: "2026-10-12T00:00:00Z",
          snapshotId: "s",
        },
        evaluation: {
          status: "complete",
          reasons: [],
          asOf: "2026-10-12T00:00:00Z",
        },
        alerts: { items: [], totalCount: 3, nextCursor: null },
      },
    ],
    pageParams: [null],
  });
  assert.match(render(), /알림, 미확인 건수 확인 중/);
  client.setQueryData(key, {
    organizationId: "org-a",
    asOf: "2026-10-12T00:00:00Z",
    requiredCount: 2,
    vendors: [],
    expiredCount: 1,
    expiredContracts: [
      { vendorId: "v", displayName: "V", endDate: "2026-10-11" },
    ],
  });
  assert.match(render(), /알림, 미확인 4건/);
  client
    .getQueryCache()
    .find({ queryKey: key })!
    .setState({ status: "error", error: new Error("unavailable") });
  assert.match(render(), /알림, 미확인 건수 조회 실패/);
  assert.doesNotMatch(render(), /알림, 미확인 0건/);
  client.clear();
});
