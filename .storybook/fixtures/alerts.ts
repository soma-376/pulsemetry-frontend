import { delay, http, HttpResponse } from "msw";
import {
  createNotificationMocks,
  NOTIFICATION_AS_OF,
} from "../../src/mocks/notifications";
import type { Alert } from "@/lib/api/alerts";

export type NotificationScenario =
  | "empty"
  | "unread"
  | "many"
  | "populated"
  | "error"
  | "loading"
  | "expired"
  | "contract-error"
  | "contract-loading";
/** 스토리마다 새 알림 원장을 만들며, 확인 뒤 목록과 배지에 같은 건수를 반환한다. */
export function notificationHandlers(scenario: NotificationScenario = "empty") {
  const timestamp = NOTIFICATION_AS_OF;
  const count =
    scenario === "many"
      ? 123
      : ["unread", "contract-error", "contract-loading"].includes(scenario)
        ? 3
        : 0;
  const alerts: Alert[] =
    scenario === "populated"
      ? createNotificationMocks()
      : Array.from({ length: count }, (_, i) => ({
          alertId: `notification-${i}`,
          version: 1,
          ruleId: "spend_spike",
          category: "cost",
          status: "open",
          occurredAt: timestamp,
          lastSeenAt: timestamp,
          windowStart: timestamp,
          windowEnd: timestamp,
          subject: null,
          eventCount: null,
          memberCount: null,
          members: [],
          acknowledgement: null,
          evidence: {
            kind: "spend",
            startDate: "2026-09-07",
            endDate: "2026-09-13",
            currentCostUsd: "5000",
            previousCostUsd: "4000",
            increaseRatio: 0.25,
          },
        }));
  return [
    http.get(
      "*/api/v1/organizations/:org/contract-input-status",
      async ({ params }) => {
        if (scenario === "contract-loading") await delay("infinite");
        if (scenario === "contract-error")
          return HttpResponse.json(
            { error: { code: "unavailable", message: "unavailable" } },
            { status: 503 },
          );
        const expiredContracts =
          scenario === "expired"
            ? [
                {
                  vendorId: "vendor/expired?test=1",
                  displayName: "Claude / Claude Code (Anthropic)",
                  endDate: "2026-09-12",
                },
              ]
            : [];
        return HttpResponse.json({
          organizationId: params.org,
          asOf: timestamp,
          requiredCount: 0,
          vendors: [],
          expiredCount: expiredContracts.length,
          expiredContracts,
        });
      },
    ),
    http.get(
      "*/api/v1/organizations/:org/alerts",
      async ({ request, params }) => {
        if (scenario === "loading") await delay("infinite");
        if (scenario === "error")
          return HttpResponse.json(
            { error: { code: "unavailable" } },
            { status: 503 },
          );
        const query = new URL(request.url).searchParams;
        const status = query.get("status"),
          category = query.get("category");
        const items = alerts.filter(
          (item) =>
            (!category || item.category === category) &&
            (status === "all" ||
              (status === "acknowledged") === !!item.acknowledgement),
        );
        const offset = Number(query.get("cursor") ?? 0);
        return HttpResponse.json({
          meta: {
            organizationId: params.org,
            snapshotId: "notifications",
            asOf: timestamp,
          },
          evaluation: {
            status: "complete",
            reasons: [],
            asOf: timestamp,
          },
          alerts: {
            items: items.slice(offset, offset + 20),
            totalCount: items.length,
            nextCursor: offset + 20 < items.length ? String(offset + 20) : null,
          },
        });
      },
    ),
    http.post(
      "*/api/v1/organizations/:org/alerts/:id/acknowledge",
      ({ params }) => {
        const alert = alerts.find((item) => item.alertId === params.id);
        if (!alert) return HttpResponse.json({}, { status: 404 });
        alert.acknowledgement = {
          acknowledgedAt: timestamp,
        };
        alert.version++;
        return HttpResponse.json({
          alertId: alert.alertId,
          version: alert.version,
          ...alert.acknowledgement,
          acknowledgedBy: "storybook-admin",
        });
      },
    ),
  ];
}
