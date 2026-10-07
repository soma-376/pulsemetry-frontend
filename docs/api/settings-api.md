# 설정 API — v1 제안

[공통 계약](README.md)을 따른다. 설정은 선택 기간이 아닌 현재 계약·정책을 다룬다.
현 화면: SettingsContent, VendorTable, VendorDrawer. 운영·보안 화면 API는 제외하되 이 화면의 정책·알림 토글은 포함한다.

## 조회

기본 경로: /api/v1/organizations/{organizationId}

| 요청 | 쿼리 / 응답 |
| --- | --- |
| GET /settings | 없음 → SettingsResponse |
| GET /vendors | limit=20, cursor, snapshotId → VendorsResponse |
| GET /vendors/{vendorId} | 없음 → VendorResponse |
| GET /installations | policyStatus=outdated, limit=20, cursor, snapshotId → InstallationsResponse |

설정 첫 조회에 벤더 첫 20개, 전체 벤더 요약, 정책, 정책 적용 수, 알림 규칙을 묶는다.
드로어는 목록의 Vendor를 활용한다. 미적용 설치의 상세 목록은 모달을 열 때 조회한다.
플랜 목록은 서버가 관리하는 catalog를 사용한다. 현재 코드의 상품명·플랜 설명·요금은 실제 공급자 계약을 보증하지 않는다.

```ts
type VendorContractDto = {
  version: number;
  planId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  termNote: string | null;
  tiers: { tierId: string; label: string; seats: number; monthlyFeePerSeatUsd: Money }[];
  monthlySeatFeeUsd: Money | null;
  confirmedAt: string;
  confirmedBy: string;
};
type Vendor = {
  vendorId: string;
  displayName: string;
  kind: string;
  source: "detected" | "manual";
  version: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  activeUsers7d: number | null;
  activeUsers30d: number | null;
  observation: Observation;
  state: "detected_unconfigured" | "needs_review" | "configured";
  contract: VendorContractDto | null;
  meteredMonthToDate: Section<{
    startDate: string;
    endDate: string;
    equivalentCostUsd: Money;
    actualBilledUsd: Money | null;
  }>;
  checks: { code: string; severity: "info" | "warning" }[];
};
type CollectionPolicy = {
  version: number;
  collectRawContent: boolean;
  reclaimIdleDays: 7 | 14 | 30 | 60;
  aggregateRetentionMonths: 12 | 24 | 36 | null;
  rawContentRetentionDays: number | null;
  effectiveAt: string;
  updatedBy: string;
};
type AlertRule = {
  ruleId: "spend_spike" | "quota_exceeded" | "model_not_allowed" | "tool_unapproved";
  version: number;
  enabled: boolean;
  availability: Availability;
  reason: string | null;
  threshold: { value: number; unit: "ratio" | "users" | "events" };
  evaluationWindow: string;
  comparisonWindow: string | null;
};
type SettingsResponse = {
  meta: CurrentMeta;
  ingest: OverviewResponse["ingest"];
  capabilities: {
    editContracts: boolean;
    editCollectionPolicy: boolean;
    editAlertRules: boolean;
    notifyInstallations: boolean;
  };
  summary: {
    configuredVendors: number;
    unconfiguredVendors: number;
    monthlySeatFeeUsd: Money | null;
    contractedSeats: number | null;
    activeSeats7d: number | null;
    meteredMonthToDate: Section<{ equivalentCostUsd: Money | null; actualBilledUsd: Money | null }>;
  };
  catalog: {
    kinds: { kind: string; displayName: string }[];
    plans: {
      planId: string; kind: string; displayName: string;
      billing: "seat" | "metered"; separateUsageBilling: boolean;
    }[];
  };
  vendors: Page<Vendor>;
  collectionPolicy: CollectionPolicy;
  policyRollout: {
    desiredVersion: number; eligibleInstallations: number;
    appliedInstallations: number; outdatedInstallations: number; unknownInstallations: number;
  };
  alertRules: AlertRule[];
};
type VendorsResponse = { meta: CurrentMeta; vendors: Page<Vendor> };
type VendorResponse = { meta: CurrentMeta; vendor: Vendor };
type InstallationsResponse = {
  meta: CurrentMeta;
  desiredPolicyVersion: number;
  installations: Page<{
    installationId: string; memberId: string | null; account: string | null;
    team: TeamRef; agentVersion: string | null; appliedPolicyVersion: number | null;
    lastHeartbeatAt: string | null; canNotify: boolean;
  }>;
};
type ContractWrite = {
  planId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  termNote: string | null;
  tiers: { label: string; seats: number; monthlyFeePerSeatUsd: Money }[];
};
type CreateVendorRequest = { kind: string; displayName: string; contract: ContractWrite };
type SaveContractRequest = {
  expectedVersion: number;
  displayName: string;
  contract: ContractWrite;
};
type PolicyPatchRequest = {
  expectedVersion: number;
  collectRawContent?: boolean;
  reclaimIdleDays?: 7 | 14 | 30 | 60;
  aggregateRetentionMonths?: 12 | 24 | 36 | null;
};
type PolicyPatchResponse = {
  policy: CollectionPolicy;
  cleanupOperationId: string | null;
};
type AlertRulePatchRequest = { expectedVersion: number; enabled: boolean };
type NotifyInstallationsRequest = { installationIds: string[]; expectedPolicyVersion: number };
```

## 벤더 계약 저장/삭제

| 요청 | 본문 / 결과 |
| --- | --- |
| POST /vendors | CreateVendorRequest → 201 VendorResponse + Location |
| PUT /vendors/{vendorId}/contract | SaveContractRequest → 200 VendorResponse |
| DELETE /vendors/{vendorId}/contract | 본문 없음, If-Match: "vendor-{version}" → 204 |
| DELETE /vendors/{vendorId} | 본문 없음, If-Match: "vendor-{version}" → 204 |

version은 Vendor.version이다. 계약이 아직 없어도 Vendor.version으로 동시 편집을 검사한다.
GET 단건 응답 ETag도 같은 형식이다. 저장은 계약과 displayName을 한 트랜잭션으로 반영한다.
신규/갱신된 계약의 confirmedAt/confirmedBy는 서버가 기록하며 UI 저장 버튼은 저장과 확인을 함께 수행한다.

요청 예:
```json
{
  "expectedVersion": 3,
  "displayName": "Vendor A",
  "contract": {
    "planId": "vendor-a/team",
    "effectiveFrom": "2026-09-20",
    "effectiveTo": null,
    "termNote": "월 단위 계약",
    "tiers": [{"label":"표준","seats":20,"monthlyFeePerSeatUsd":"30.000000"}]
  }
}
```

- 날짜는 조직 타임존의 포함 시작/종료 날짜다. 종료일 없으면 null. termNote는 설명이며 날짜를 대신하지 않는다.
- v1 신규 변경은 조직의 오늘 이후부터 적용한다. 과거 정정은 별도 이력 정정 흐름으로 합의한다.
  기존 이력을 덮어써서 과거 개요의 지출이 갑자기 바뀌지 않게 한다.
- 좌석제 tiers는 1~3개, seats 양의 정수, 요금은 0 이상 USD decimal. 종량제 tiers=[].
  planId가 kind와 맞는지 검사한다. 서버가 등급 ID와 월 합계를 계산한다.
- monthlySeatFeeUsd=등급별 seats×monthlyFeePerSeatUsd 합계.
- 감지 벤더는 계약만 해제하고 텔레메트리 행은 유지한다.
  수동 벤더 제거는 관리 대상에서 보관 처리하는 것이며 과거 사용/계약 이력은 보존한다.
  수동 벤더에 신호가 연결되었으면 계약 해제 방식으로 처리하도록 422 반환한다.
- DELETE는 오늘부터 유효 계약을 종료한다. 실제 공급자의 구독 취소/청구 감액 API가 아니다.
- 사용자가 계약 좌석보다 많다는 것만으로 입력 오류를 확정하지 않는다.
  계정/좌석 대응, 좌석 순환, 종량제 사용이 있을 수 있으므로 checks 경고와 근거를 반환한다.
- 신호 없는 벤더를 미사용 좌석으로 간주하지 않는다. activeSeats7d는 실제 좌석 대응·충분한 관측이 있어야 제공한다.
- 종량 환산 비용과 실제 청구액은 다르다. 실제 인보이스 원천이 없으면 actualBilledUsd=null.
  화면의 “입력 없이 확정”, “콘솔 오차 0.4%” 같은 고정 문구는 실제 연동 시 제거해야 한다.
- 7일/30일 사용자는 asOf가 속한 조직 날짜를 끝으로 하는 달력 날짜 범위. 당일은 부분 관측이다.
  월 사용량은 조직 시간 기준 이번 달 1일부터 asOf까지이고 월 전체 예상액이 아니다.
- summary는 목록 전체 범위다. 일부 계약 누락을 0원으로 합쳐 확정 총액으로 보이지 않게 한다.

## 수집 정책

PATCH /settings/collection-policy → 200 PolicyPatchResponse.
변경하는 필드만 보내며 최소 1개가 필요하다. UI의 “미적용” 보존 옵션은 null(무기한)이다.
원문 수집 양방향 변경, 집계 보존 기간 단축은 현재 확인 모달 후 요청한다.
서버는 정책 버전을 올리고 actor/변경 전후/시각을 감사 기록한다.
변경 없는 값은 같은 버전 반환, 충돌은 409.

예:
```json
{"expectedVersion":4,"collectRawContent":false,"aggregateRetentionMonths":12}
```

- 원문 정책은 프롬프트·응답뿐 아니라 도구 인수/파일 경로/오류 본문까지 적용할 범위를 수집기와 합의한다.
- effectiveAt 이후 수신되는 데이터를 서버 정책으로 검증한다. 구버전 설치가 계속 본문을 보내더라도
  collectRawContent=false이면 서버가 허용되지 않은 본문을 저장하지 않도록 한다.
- 정책 저장 성공과 전 설치 적용 완료는 다르다. appliedPolicyVersion이 확인된 설치만 applied로 센다.
- eligible=applied+outdated+unknown. 정책 ACK가 없으면 unknown이며 적용 완료로 추정하지 않는다.
- 원문 보존 기간과 집계 보존 기간은 별개다. rawContentRetentionDays는 서버의 기존 원문 정책을 읽기만 한다.
- 집계 보존 단축은 정리 작업을 예약하고 cleanupOperationId로 결과를 조회한다.
  오래된 집계가 지워지는 정확한 경계는 asOf에서 N개월 전 월력 날짜의 KST 자정 미만으로 한다
  (일자가 없는 달이면 말일). 원문 삭제는 이 설정의 범위가 아니다.
- 보존 기간 연장으로 이미 삭제된 기록이 복구되지는 않는다.
- reclaimIdleDays 변경은 구성원의 현재 회수 후보 판정에도 같은 정책 버전으로 적용한다.

## 알림과 미적용 설치

PATCH /settings/alert-rules/{ruleId}, AlertRulePatchRequest → 200 AlertRule.
v1은 토글만 수정한다. UI의 고정 임계값은 서버 값으로 대체한다.
spend_spike는 직전 완전한 KST 7일 대 이전 7일 비용 증가율 0.4,
quota_exceeded는 최근 24시간 차단된 고유 사용자 5명,
model_not_allowed/tool_unapproved는 최근 24시간 해당 이벤트 1회가 **초기 제안 기준**이다.
평가 창·허용 목록·차단 이벤트가 없다면 unavailable/reason을 반환하고 토글을 비활성화한다.
이 명세가 알림 평가 엔진이나 실제 전송 채널까지 구현되었다는 뜻은 아니다.

GET /installations의 outdated는 적용 버전이 알려져 있고 desiredVersion보다 낮은 설치다.
미확인 버전은 unknown으로 별도 취급한다. 이메일 등 개인 식별 정보는 기존 서버 권한 정책을 따른다.
이 문서는 새로운 소규모 팀 마스킹 규칙을 추가하지 않는다.

POST /installation-update-notifications, NotifyInstallationsRequest → 202 OperationResponse.
최대 100개 ID, Idempotency-Key 필수. 대상 조직·현재 정책 버전·전송 채널을 확인한다.
알림을 보내는 동작이며 원격 자동 업데이트 명령이 아니다.
전송 채널이 없으면 notifyInstallations=false, 실행 요청은 422 notification_channel_unavailable.
작업이 succeeded여도 설치 정책 적용과는 구분한다. 모달의 “보냈습니다”는 확인된 전송 결과만 표시한다.

## 수용 기준

- 계약 변경/해제로 과거 유효 계약 이력이 보존된다.
- 두 관리자 동시 수정은 version 충돌로 검출한다.
- 월 요금·현재 월 사용·실제 청구·환산가치를 혼동하지 않는다.
- 설정을 바꾸면 구성원 회수 기준/개요 좌석 계산이 같은 저장값과 버전을 사용한다.
- 원문 정책의 서버 적용과 설치 rollout, 보존 작업의 예약과 완료를 구분한다.
- 권한 없는 변경, 다른 조직 벤더/설치 참조, 잘못된 enum/날짜/음수 요금은 거부한다.
- 실제 기능이 없는 안내 전송/알림 평가를 가짜 성공으로 응답하지 않는다.

응답 예시: [settings-response.example.json](settings-response.example.json).
