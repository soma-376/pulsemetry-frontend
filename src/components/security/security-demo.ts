import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import {
  alertsOptions,
  fetchAlerts,
  type Alert,
  type AlertsPage,
  type AlertStatus,
} from "@/lib/api/alerts";
import { managementKey, readOptions } from "@/lib/api/management";
import type { Settings } from "@/lib/api/settings";
import type { AuthUser } from "@/lib/auth-user";

/**
 * 보안 화면 시연용 고정 데이터. 아래 두 조직만 서버를 조회하지 않고 이 값을 보인다.
 * - 시드 A(`pulsemetry-seed-a`): dev-seed 가 `nameUUIDFromBytes` 로 만든 고정 ID 라 환경이 달라도 같다.
 * - soma: `historical_seed.py` 가 이름·slug 를 `soma` 로 고정한다. ID 는 스냅샷 manifest 값이라 이름으로 판별한다.
 */
const SEED_A_ORGANIZATION_ID = "1b59ab21-1788-35e0-bfd7-23baa88a35b4";
const SOMA_ORGANIZATION_NAME = "soma";

export const isSecurityDemoOrganization = (
  user: Pick<AuthUser, "organizationId" | "organizationName">,
) =>
  user.organizationId === SEED_A_ORGANIZATION_ID ||
  user.organizationName.trim().toLowerCase() === SOMA_ORGANIZATION_NAME;

const HOUR = 3_600_000;
const DEMO_ALERT_ID = "security-demo-grok";
/** 화면을 처음 연 시각 기준으로 상대 시간을 고정한다(새로고침마다 발견 시점이 움직이지 않게). */
let baseTime: number | null = null;
const base = () => (baseTime ??= Date.now());
const at = (hoursAgo: number) =>
  new Date(base() - hoursAgo * HOUR).toISOString();
/** 시연 중 누른 확인 — 새로고침하면 다시 미확인으로 돌아간다. */
const acknowledgedAt = new Map<string, string>();

const grokAlert = (organizationId: string): Alert => {
  const acknowledged = acknowledgedAt.get(organizationId);
  return {
    alertId: DEMO_ALERT_ID,
    version: 1,
    ruleId: "product_not_registered",
    category: "security",
    status: "open",
    occurredAt: at(50),
    lastSeenAt: at(3),
    windowStart: at(50),
    windowEnd: at(0),
    subject: "Grok",
    eventCount: 4,
    memberCount: 1,
    members: [],
    evidence: { kind: "usage", targetName: "Grok" },
    acknowledgement: acknowledged ? { acknowledgedAt: acknowledged } : null,
  };
};

export function demoSecurityAlertsPage(
  organizationId: string,
  status: AlertStatus,
): AlertsPage {
  const alert = grokAlert(organizationId);
  const visible =
    status === "all" ||
    (status === "acknowledged") === (alert.acknowledgement !== null);
  const items = visible ? [alert] : [];
  return {
    meta: {
      organizationId,
      snapshotId: "security-demo",
      asOf: new Date().toISOString(),
    },
    evaluation: { status: "complete", reasons: [], asOf: at(0.1) },
    alerts: { items, totalCount: items.length, nextCursor: null },
  };
}

/**
 * 보안 화면의 보안 알림 조회. 일반 조직은 `alertsOptions(org, status, "security")` 와 같은 키·조회이고,
 * 시연 조직은 키 끝에 "demo" 를 붙여 실제 응답 캐시와 섞이지 않게 고정 값을 돌려준다.
 */
export const securityAlertsOptions = (
  organizationId: string,
  status: AlertStatus,
  demo: boolean,
) => {
  const real = alertsOptions(organizationId, status, "security");
  return infiniteQueryOptions({
    queryKey: demo ? [...real.queryKey, "demo"] : [...real.queryKey],
    queryFn: ({ pageParam, signal }) =>
      demo
        ? Promise.resolve(demoSecurityAlertsPage(organizationId, status))
        : fetchAlerts(organizationId, status, "security", pageParam, signal),
    initialPageParam: real.initialPageParam,
    getNextPageParam: real.getNextPageParam,
    enabled: !!organizationId,
    ...readOptions,
  });
};

/** 실제 확인(`acknowledgeAlert`)과 같은 모양을 돌려준다. */
export const acknowledgeDemoSecurityAlert = async (organizationId: string) => {
  const acknowledged = new Date().toISOString();
  acknowledgedAt.set(organizationId, acknowledged);
  return {
    alertId: DEMO_ALERT_ID,
    version: 1,
    acknowledgedAt: acknowledged,
    acknowledgedBy: "security-demo",
  };
};

export type PolicyRolloutData = Pick<Settings, "policyRollout">;

/** 활성 설치 100대 중 98대가 최신 정책(98%). */
export const demoPolicyRolloutOptions = (organizationId: string) =>
  queryOptions<PolicyRolloutData>({
    queryKey: [...managementKey(organizationId, "settings"), "security-demo"],
    queryFn: async () => ({
      policyRollout: {
        desiredVersion: 2,
        eligibleInstallations: 100,
        appliedInstallations: 98,
        outdatedInstallations: 1,
        unknownInstallations: 1,
        evidence: { heartbeat: 97, appliedConfirmation: 2, none: 1 },
      },
    }),
    staleTime: Infinity,
  });
