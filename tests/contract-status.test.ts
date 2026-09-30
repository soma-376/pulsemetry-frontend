import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { settingsFixture, syncSettingsSummary } from "../.storybook/fixtures/settings";
import { settingsVendorSchema } from "../src/lib/api/settings";
import { overviewSettingsSchema } from "../src/lib/api/overview-vendors";
import { overviewSchema } from "../src/lib/api/overview";
import { settingsVendorRow } from "../src/lib/settings-vendors";
import { contractSummaryNotice } from "../src/lib/contract-status";
import { presentOverview } from "../src/lib/metrics/overview-presentation";
import { VendorSeatsCard } from "../src/components/overview/VendorSeatsCard";
import example from "../docs/api/overview-response.example.json";

test("A Copilot 만료 계약은 마지막 금액과 좌석을 보존하고 유효 계약만 합산한다", () => {
  const settings = settingsFixture();
  const copilot = settings.vendors.items.find(v => v.kind === "copilot")!;
  assert.equal(copilot.contractStatus, "expired");
  assert.equal(copilot.contract!.effectiveTo, "2026-09-27");
  assert.equal(copilot.contract!.monthlySeatFeeUsd, "95");
  const row = settingsVendorRow(copilot);
  assert.equal(row.statusLabel, "계약 만료");
  assert.match(row.seatsText, /마지막 계약 5석/);
  assert.match(row.spendText, /마지막 계약 \$95/);
  // 시드 A 명세: 유효 계약은 Claude Team 월 $360(10석)과 OpenAI Business 월 $400(8석)이다. 만료된 Copilot은 합산하지 않는다.
  assert.equal(settings.summary.monthlySeatFeeUsd, "760");
  assert.equal(settings.summary.contractedSeats, 18);
  assert.match(contractSummaryNotice(settings.vendors.items)!, /만료 1건 제외/);
  const contracts = overviewSettingsSchema.parse({ ...settings, meta: { ...settings.meta, asOf: "2026-09-28T00:00:00Z" }, catalog: { plans: [] } });
  const model = presentOverview(overviewSchema.parse(example), contracts);
  const detail = model.vendorOverview.rows.find(v => v.id === copilot.vendorId)!;
  assert.equal(detail.status, "계약 만료");
  assert.equal(detail.monthly, 95);
  assert.equal(model.kpis.find(v => v.label === "월 좌석 계약액")!.value, "$760.00");
  const html = renderToStaticMarkup(createElement(VendorSeatsCard, { model: { ...model.vendorOverview, rows: [detail] } }));
  assert.match(html, /계약 만료/);
  assert.match(html, /마지막 계약 금액/);
  assert.match(html, /마지막 계약 좌석/);
});

test("프론트는 서버 계약 상태를 따르고 모르는 enum을 정상 계약으로 대체하지 않는다", () => {
  const vendor = settingsFixture().vendors.items[0];
  assert.equal(settingsVendorSchema.safeParse({ ...vendor, contractStatus: "unknown" }).success, false);
  assert.equal(settingsVendorRow({ ...vendor, contractStatus: "scheduled" }).statusLabel, "시작 예정");
  assert.equal(contractSummaryNotice([{ contractStatus: "active" }]), null);
});


test("유효 계약이 없거나 등록이 비어 있으면 0, 유효 계약의 금액을 모르면 null", () => {
  const data = settingsFixture();
  const active = data.vendors.items.filter(vendor => vendor.contractStatus === "active");
  assert.equal(active.length, 2);
  for (const vendor of active) vendor.contractStatus = "scheduled";
  syncSettingsSummary(data);
  assert.equal(data.summary.monthlySeatFeeUsd, "0");
  assert.equal(data.summary.contractedSeats, 0);
  assert.match(contractSummaryNotice(data.vendors.items)!, /시작 예정 2건 제외/);
  const claude = data.vendors.items.find(vendor => vendor.kind === "claude_team")!;
  claude.contractStatus = "active";
  claude.contract!.monthlySeatFeeUsd = null;
  syncSettingsSummary(data);
  assert.equal(data.summary.monthlySeatFeeUsd, null);
  assert.equal(data.summary.contractedSeats, 10);
  data.vendors.items = [];
  syncSettingsSummary(data);
  assert.equal(data.summary.monthlySeatFeeUsd, "0");
  assert.equal(data.summary.contractedSeats, 0);
});
