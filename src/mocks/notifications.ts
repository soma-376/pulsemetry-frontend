import type { Alert } from "@/lib/api/alerts";

export const NOTIFICATION_AS_OF = "2026-10-10T14:00:00Z";
const DAY = 86_400_000;
const products = [
  ["mock-codex", "ChatGPT / Codex (OpenAI)"],
  ["mock-claude", "Claude (Anthropic)"],
  ["mock-copilot", "GitHub Copilot Business"],
  ["mock-cursor", "Cursor Teams"],
  ["mock-gemini", "Gemini Code Assist Enterprise"],
  [
    "mock-long-name",
    "개발 플랫폼팀 공용 AI 코딩 도우미 — Enterprise Extended Workspace",
  ],
] as const;

/** UI 검증용 100건: 제품 70 / 비용 30, 미확인 60 / 확인함 40. 호출마다 독립 원장을 만든다. */
export function createNotificationMocks(): Alert[] {
  return Array.from({ length: 100 }, (_, index) => {
    const productAlert = index % 10 < 7;
    const occurred = Date.parse(NOTIFICATION_AS_OF) - index * DAY - 35 * 60_000;
    const occurredAt = new Date(occurred).toISOString();
    const acknowledged = index % 5 >= 3;
    const [productId, productName] = products[index % products.length];
    const memberCount = (index % 8) + 1;
    const events = index % 9 === 0 ? 12480 + index : (index + 1) * 7;
    const previous = [200, 1250, 18450, 98500][index % 4];
    const increaseRatio = [0.4, 0.52, 0.86, 1.25, 2.4][index % 5];
    const date = (daysBefore: number) =>
      new Date(occurred - daysBefore * DAY).toISOString().slice(0, 10);
    return {
      alertId: `mock-alert-${String(index + 1).padStart(3, "0")}`,
      version: 1,
      ruleId: productAlert ? "product_not_registered" : "spend_spike",
      category: productAlert ? "security" : "cost",
      status: index < 2 ? "open" : "closed",
      occurredAt,
      lastSeenAt: productAlert
        ? new Date(occurred + 20 * 60_000).toISOString()
        : occurredAt,
      windowStart: productAlert
        ? occurredAt
        : new Date(occurred - 6 * DAY).toISOString(),
      windowEnd: productAlert
        ? new Date(occurred + DAY).toISOString()
        : occurredAt,
      subject: productAlert ? productId : null,
      eventCount: productAlert ? events : null,
      memberCount: productAlert ? memberCount : null,
      members: productAlert
        ? Array.from({ length: memberCount }, (_, member) => ({
            memberId: `mock-member-${index}-${member}`,
            account:
              member === 0 && index % 6 === 0
                ? "platform-engineering-workspace-admin@example.test"
                : `member${index + member + 1}@example.test`,
          }))
        : [],
      acknowledgement: acknowledged
        ? {
            acknowledgedAt: new Date(occurred + 30 * 60_000).toISOString(),
          }
        : null,
      evidence: productAlert
        ? { kind: "usage", targetName: productName }
        : {
            kind: "spend",
            startDate: date(6),
            endDate: date(0),
            currentCostUsd: (previous * (1 + increaseRatio)).toFixed(2),
            previousCostUsd: previous.toFixed(2),
            increaseRatio,
          },
    };
  });
}
