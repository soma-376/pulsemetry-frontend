# 개요 API 구현 요청서 — 제안 v1

작성 기준: 2026-09-20의 pulsemetry-frontend 개요 화면.
이 문서는 **구현할 API 계약 제안**이다. 현재 프론트는 로컬 데이터로 동작하며,
이 엔드포인트의 존재나 백엔드 DB 컬럼을 확인한 것은 아니다.
기존 백엔드의 라우트 prefix·인증 방식은 재사용하고, 아래 응답의 의미를 유지한다.

함께 전달할 파일: [overview-response.example.json](./overview-response.example.json).
예시는 형식과 합계 검증용 가상 값이며 실제 모델 단가·청구액이 아니다.

## 1. 범위

개요 진입과 기간/비교 변경 시 한 번 호출한다.
응답은 수집 상태, KPI, 날짜별 차트, 모델 구성, 사용 낭비, 상위 3팀과 미배분을 포함한다.
개인별 목록, 팀 상세 드로어, 설치 토큰 발급은 포함하지 않는다.
팀 상세 드로어는 팀 분석 페이지의 별도 API 대상이다.

| 화면 | 필요한 데이터 | 원천 |
|---|---|---|
| 수집 상태·커버리지 | 마지막 수신 시각, 수집 상태, 활성 설치 수, 관측된 구성원 수, 대상 구성원 수 | 설치/하트비트·수집 파이프라인·조직 구성원 |
| 활성 좌석·세션 KPI | 기간 고유 사용자 수, 고유 세션 수, 계약 좌석 수 | 정규화된 사용 이벤트·좌석 계약 |
| 토큰 비용 KPI | 토큰 종류별 수량, 공시 단가 환산가치, 이전 기간 값 | 사용 이벤트·유효기간이 있는 가격표 |
| 좌석 효율 | 동일 벤더 범위의 환산가치와 기간 배분 좌석료 | 사용 집계·계약 이력 |
| 현재 미확인 알림 | 보안·비용별 미확인 건수와 기준 시각 | 알림 저장소 |
| 환산가치 vs 지출 | 날짜별 환산가치, 배분 좌석료, 토큰 수량, 관측 상태 | 일별 사용 집계·계약 이력 |
| 모델 구성 | 모델 ID/이름, 모델별 환산가치와 토큰, 실효 단가 | 모델별 사용 집계 |
| 사용 낭비 | 항목별 근거 있는 추정 비용·비율·산식 버전 | 요청 상태·캐시/컨텍스트 분석 |
| 팀별 사용량 | 환산가치 상위 3팀의 사용자 수·금액·주요 모델, 이전 값, 미배분 | 팀 귀속 집계 |

## 2. 요청

```http
GET /api/v1/organizations/{organizationId}/analytics/overview?startDate=2026-09-07&endDate=2026-09-13&compare=prev_week&timeZone=Asia%2FSeoul
```

| 파라미터 | 규칙 |
|---|---|
| organizationId | 조직 식별자. 서버에서 기존 인증 컨텍스트의 조직 접근 권한을 검증 |
| startDate | 필수, 실제 존재하는 YYYY-MM-DD 날짜 |
| endDate | 필수, YYYY-MM-DD. **종료 날짜도 포함** |
| compare | prev_week / prev_period / none. 기본 prev_week |
| timeZone | v1은 Asia/Seoul만 지원, 생략 시 Asia/Seoul. 다른 값은 400 |

v1 집계는 일 단위이며 기간은 1~366일이다. 날짜 순서 오류·형식 오류·미지원 enum은 400.
각 날짜를 KST 자정 기준으로 해석하고 저장소 조회는 [시작 자정, 종료 다음 날 자정)으로 변환한다.
예시 요청의 UTC 범위는 [2026-09-06T15:00:00Z, 2026-09-13T15:00:00Z)이다.

- prev_week: 선택한 범위의 양 끝을 7일 이전으로 이동한다. 28일 선택이면 비교 범위도 28일이며 현재 범위와 겹칠 수 있다.
- prev_period: 선택한 N일 직전의 N일을 조회한다.
- none: 비교 조회를 생략하고 previous 값과 비교 날짜를 null로 반환한다.
- 현재 프론트의 24h 버튼은 기준일 하루를 선택한다. v1에서는 **달력상 하루**다. 실제 최근 24시간을 지원하려면 timestamp 요청·시간 버킷과 프론트 변경이 추가로 필요하다.
- 미래/수집 이전 날짜도 유효한 요청이다. 400이나 가짜 0이 아니라 데이터 부재 상태를 반환한다.

## 3. 응답 타입

모든 키는 유지하고, 산출할 수 없는 값은 null로 반환한다.
금액은 USD 소수 문자열(예: "1234.560000"), 수량은 정수 number, 비율은 0~1의 number다.
퍼센트의 +12%는 0.12, 효율 1.25배는 1.25다. 숫자를 "$1,234"나 "1.2M"로 포맷하지 않는다.
정수는 JSON/JS의 안전 정수 범위를 넘기지 않아야 하며, 초과가 예상되면 연동 전에 문자열 계약으로 변경한다.

```ts
type Money = string;
type Availability = "available" | "partial" | "unavailable";
type Observation = "complete" | "partial" | "unobserved";
type Coverage = {
  status: "complete" | "partial" | "none";
  observedDays: number; // 부분 관측 날짜 포함. 이 숫자만으로 완전성을 판정하지 않음
};
type Tokens = {
  inputUncached: number | null;
  output: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  total: number | null;
};
type Usage = {
  activeUsers: number | null;
  sessionCount: number | null;
  tokens: Tokens;
  equivalentCostUsd: Money | null;
};
type SeatPeriod = {
  contractedSeats: number; // 해당 기간 종료 시점의 계약 좌석 수
  activeSeats: number | null; // 벤더/계약별 실제 좌석의 기간 고유 수
  monthlyFeeUsd: Money; // 해당 기간 종료 시점 계약의 월 비용
  allocatedFeeUsd: Money; // 전체 선택 기간에 배분한 좌석료
  equivalentCostUsd: Money; // 위 좌석료와 같은 벤더 범위의 환산가치
  efficiency: number | null;
};
type TeamPeriod = {
  activeUsers: number | null;
  equivalentCostUsd: Money | null;
};
type TopModel = { modelId: string; displayName: string; share: number };
type WasteItem = {
  kind: "cache_miss" | "retry_or_abort" | "excessive_context";
  availability: Availability;
  reason: string | null;
  currentEquivalentCostUsd: Money | null; // 선택 기간 추정 낭비액
  previousEquivalentCostUsd: Money | null;
  monthlyEquivalentCostUsd: Money | null;
  previousMonthlyEquivalentCostUsd: Money | null;
  rate: number | null;
  rateDefinition: string | null; // 비율의 분자·분모 정의
};
type OverviewResponse = {
  meta: {
    organizationId: string;
    generatedAt: string; // UTC RFC3339
    dataThrough: string | null; // 집계에 공통 적용한 사용 데이터 cutoff
    currency: "USD";
    startDate: string;
    endDate: string;
    timeZone: "Asia/Seoul";
    dayCount: number;
    dataState: "ready" | "partial" | "no_data" | "never_observed";
    currentCoverage: Coverage;
    pricingVersion: string | null;
  };
  comparison: {
    mode: "prev_week" | "prev_period" | "none";
    startDate: string | null;
    endDate: string | null;
    status: "available" | "unavailable" | "disabled";
    reason: string | null;
    coverage: Coverage | null;
  };
  ingest: {
    status: "empty" | "healthy" | "delayed" | "down" | "unknown";
    reason: string | null;
    asOf: string;
    firstObservedAt: string | null;
    lastReceivedAt: string | null;
    windowMinutes: number;
    activeInstallations: number | null;
    observedMembers: number | null;
    eligibleMembers: number | null;
    coverageRatio: number | null;
  };
  usage: { current: Usage | null; previous: Usage | null };
  seats: {
    availability: Availability;
    reason: string | null;
    scopeVendorIds: string[];
    allocationMethod: "contract_proration" | "estimated_30_day" | null;
    current: SeatPeriod | null;
    previous: SeatPeriod | null;
    reclaimEstimate: {
      idleSeats: number;
      monthlySavingsUsd: Money;
      efficiencyAfterReclaim: number | null;
    } | null;
  };
  alerts: {
    availability: "available" | "unavailable";
    reason: string | null;
    asOf: string;
    unacknowledgedTotal: number | null;
    security: number | null;
    cost: number | null;
  };
  trend: {
    bucket: "day";
    points: {
      date: string;
      observation: Observation;
      equivalentCostUsd: Money | null;
      allocatedSeatCostUsd: Money | null;
      totalTokens: number | null;
    }[];
  };
  modelMix: {
    availability: Availability;
    reason: string | null;
    models: {
      modelId: string; // 공급자를 포함해 유일한 정규화 ID
      displayName: string;
      equivalentCostUsd: Money | null;
      totalTokens: number | null;
      effectiveCostPerMillionTokensUsd: Money | null;
    }[];
  };
  waste: {
    availability: Availability;
    reason: string | null;
    methodologyVersion: string | null;
    totalMonthlyEquivalentCostUsd: Money | null;
    items: WasteItem[];
  };
  teamUsage: {
    availability: Availability;
    reason: string | null;
    ranking: "equivalentCostUsd_desc";
    attributionBasis: "event_time";
    totalTeamCount: number; // 권한 범위 내 전체 집계 대상 팀 수. 미배분 제외
    topTeams: {
      teamId: string;
      teamName: string;
      current: TeamPeriod;
      previous: TeamPeriod | null;
      topModel: TopModel | null;
    }[]; // 최대 3개
    otherTeams: {
      count: number;
      currentEquivalentCostUsd: Money | null;
      previousEquivalentCostUsd: Money | null;
    }; // 화면의 추가 행이 아니라 합계 검증용
    unassigned: {
      current: TeamPeriod;
      previous: TeamPeriod | null;
    };
  };
};
```

## 4. 집계 의미와 화면 계산

### 사용량과 비용

- activeUsers는 조직 전체의 canonical user ID 고유 수다. 일별 사용자 수나 팀별 사용자 수를 더하지 않는다.
- 활성 기준은 해당 기간의 유효한 사용 이벤트다. 하트비트만 있는 사용자는 활성 사용자로 세지 않는다.
- sessionCount는 기간 내 사용 이벤트가 있는 (도구/공급자, session ID)의 고유 수다. 이벤트 행 수나 일별 distinct의 합이 아니다.
- 토큰 범주는 중복되지 않게 정규화한다. inputUncached에는 cacheRead/cacheWrite를 제외한다.
- total은 네 범주가 모두 알려진 경우 합계다. 공급자가 일부 범주를 제공하지 않으면 미수집과 실제 0을 구분한다.
- 비용은 이벤트 시점의 모델·토큰 종류별 유효 단가로 환산한다. 캐시 할인과 별도 요금 범주도 반영한다.
- 단가를 찾을 수 없는 사용량을 0원으로 취급하지 않는다. 불완전한 총액은 null, 관련 section은 partial/unavailable과 사유를 반환한다.
- equivalentCostUsd는 종량제 공시 단가로 환산한 가치다. 실제 청구액이 아니다.

### 좌석과 효율

- 조직 고유 사용자와 계약 좌석은 단위가 다를 수 있다. 여러 도구의 좌석을 한 사람이 사용하면 activeUsers 1명, activeSeats 2석일 수 있다.
- 계약 수, 단가, 적용 날짜, 좌석 배정 정보는 계약/조직 저장소에서 가져온다. 텔레메트리만으로 추정하지 않는다.
- efficiency = 같은 벤더 범위의 equivalentCostUsd / allocatedFeeUsd.
- 현재/이전 계약 변경을 반영해서 두 기간을 각각 계산한다. 비용 성장률을 곧바로 효율 성장률로 사용하지 않는다.
- 추이 차트의 지출은 usage와 같은 전체 벤더 범위를 비교할 수 있을 때만 반환한다. 일부 벤더 계약 누락 시 allocatedSeatCostUsd는 null이다.
- 기존 프론트의 월 비용 × 일수 / 30은 estimated_30_day 방식이다. 이 방식이면 배분 **추정액**으로 표시해야 한다.
- 계약상 실제 배분 규칙이 있으면 contract_proration으로 계산한다. 현재 코드의 “실제 청구액” 주석을 그대로 사양으로 옮기지 않는다.
- reclaimEstimate는 좌석 배정, 등급별 단가, 관측 완전성, 회수 가능 조건이 확인될 때만 반환한다.
- seats 전체가 미지원이면 current/previous/reclaimEstimate 모두 null이다. 불완전한 계약 정보를 합쳐 확정 총액처럼 반환하지 않는다.
- 분모 0, 불완전 관측, 비교 범위 불일치 시 비율은 null이다.

### 모델 구성

모델별 금액을 모두 반환하고 프론트가 상위 4개 + 나머지를 “기타”로 묶는다.
modelId는 공급자를 포함해 유일해야 하며 미확인 모델도 별도 ID로 포함해 총액을 보존한다.
effectiveCostPerMillionTokensUsd = 모델 환산가치 / 모델 총 토큰 × 1,000,000.
이는 입력/출력/캐시가 섞인 **실효 단가**다. 공급자 공시 단일 단가라고 표시하지 않는다.

### 팀별 사용량

- 비용 내림차순, 동률이면 teamId 오름차순으로 상위 3팀을 고른다. 미배분은 순위에서 제외한다.
- 이벤트 당시 하나의 대표 teamId에 귀속한다. 없으면 미배분이다. 팀 이동 이력은 비용을 중복 귀속하지 않는다.
- 백엔드가 현재 팀 매핑만 보유한다면 event_time을 구현한 것으로 응답하지 말고, 귀속 기준 계약부터 합의한다.
- 현재 상위 3팀 각각의 **동일 teamId**에 대해 이전 기간 값을 조회한다. 이전 상위 3팀과 zip하면 안 된다.
- 팀별 사용자 수는 그 팀에 귀속된 기간 내 사용자의 고유 수다. 팀 이동 시 팀 간 중복이 가능하므로 합이 조직 고유 사용자 수와 같을 필요는 없다.
- otherTeams는 나머지 팀의 금액만 합산한다. 미배분과 섞지 않으며 프론트 표에 행을 추가하지 않는다.
- 사용자가 0명이면 사용자당 값은 null로 표시한다.
- 팀별 사용자당 = 팀 금액 / 팀 사용자 수.
- 증가 기여 = 해당 팀 현재 금액 - 해당 팀 이전 금액. 비율이 아니라 USD 변화액이다.
- topModel.share = 해당 팀 주요 모델 금액 / 해당 팀 전체 금액.

### 비교와 데이터 부재

- comparison.status=available은 두 기간의 관측이 충분하고 비교할 수 있다는 뜻이다. 개별 지표의 이전 값이 0이면 그 지표 증감률은 별도로 null이다.
- 증감률 = (현재 - 이전) / 이전. 이전 0 → 현재 양수는 “신규”, 0 → 0은 “변화 없음”으로 UI가 구분한다. Infinity/NaN이나 가짜 0%를 반환하지 않는다.
- none이면 comparison.status=disabled, usage.previous/seats.previous/각 팀 previous/otherTeams.previousEquivalentCostUsd/낭비 previous 값 모두 null이다.
- 비교 기간이 불완전하거나 수집 장애로 안전하게 비교할 수 없으면 unavailable과 기계 판독 가능한 reason을 반환한다. 이 경우에도 previous 값은 모두 null로 통일한다.
- ready는 사용량의 조회 범위가 관측됐다는 뜻이며, 선택 기능인 낭비/알림의 제공 여부는 각 section 상태로 판단한다.
- never_observed는 조직 수집 이력이 없는 경우다. no_data는 이력은 있으나 요청 범위에 관측된 데이터가 없는 경우다.
- 수집이 정상이고 사용만 없었던 날짜는 complete + 실제 0이다. 미관측 날짜는 unobserved + 사용량 null이다.
- 부분 관측 날짜에는 알려진 부분 집계값과 partial 상태를 반환한다. 프론트는 부분 값임을 표시하고 전체 기간 효율·비교 판정을 보류한다.
- trend.points는 요청한 날짜를 빠짐없이 오름차순으로 반환한다. 누락 구간의 선을 연결하거나 미관측을 0으로 표시하지 않는다.
- no_data/never_observed이면 usage.current=null, 모델/상위 팀 배열은 비우고 teamUsage의 현재 금액/사용자 수도 null이다. totalTeamCount는 알려진 조직 정보를 유지할 수 있다.
- 현재 기간을 포함하면 아직 지나지 않은 시간은 미관측이다. “이벤트가 있는 날짜 수 = 완전 관측 일수”로 판단하지 않는다.

### 수집 상태와 알림

- ingest는 선택 기간 집계가 아니라 asOf 기준 운영 현황이다. 제안 기본 windowMinutes=15.
- activeInstallations는 최근 windowMinutes 내 하트비트가 있는 installation ID 고유 수다.
- observedMembers는 같은 창에서 관측된 canonical user ID 고유 수다.
- eligibleMembers는 관측 대상 활성 조직 구성원 수이며 coverageRatio=observedMembers/eligibleMembers다. 설치 수/사람 수로 나누지 않는다.
- eligibleMembers=0이면 coverageRatio=null. 수집 상태 조회 실패도 0이 아닌 null/unknown이다.
- 마지막 사용 이벤트가 오래됐다는 이유만으로 down을 판정하지 않는다. 하트비트·수집기 상태와 백엔드의 운영 기준을 사용한다.
- 장애 때문에 과거 사용량을 0으로 덮지 않는다. dataThrough/마지막 수신 시각으로 신선도를 표시한다.
- alerts는 asOf의 현재 미확인 알림이다. 조회 기간으로 필터링하지 않는다.
- v1 알림 분류는 security와 cost이며 total=security+cost다. 다른 분류가 실제로 존재하면 계약을 확장한다.

### 사용 낭비

현재 프론트는 상수와 비용 비례식으로 낭비액을 만든다. 실제 API에서 이 산식을 사용하지 않는다.

- cache_miss: 캐시로 대체 가능했는지 판단할 근거와 비용 차액이 필요하다. 캐시 미적중 토큰 전부를 낭비로 간주하지 않는다.
- retry_or_abort: 요청/시도 ID, 재시도 연결, 중단 상태, 해당 시도의 과금 토큰이 필요하다.
- excessive_context: 컨텍스트 과다 판정 기준과 절감 가능 토큰 추정 근거가 필요하다.
- 실제 이벤트 필드나 분석 규칙이 없다면 해당 항목은 unavailable, 모든 숫자는 null, reason은 methodology_not_available 또는 source_not_available이다.
- rateDefinition에는 분자·분모를, methodologyVersion에는 판정 규칙 버전을 남긴다.
- 월 환산은 완전 관측 구간에서 기간 추정 낭비액 × 30 / 기간 일수로 한다. 부분 관측을 월 전체로 무조건 외삽하지 않는다.
- 항목 간 중복이 제거된 총액만 totalMonthlyEquivalentCostUsd로 반환한다. 중복 여부가 불명확하면 총액은 null이고 항목별 값만 제공한다.
- “미지원”과 “낭비 0원”은 다른 상태다.

## 5. 구현 순서와 성능

1. 실제 이벤트·계약·팀·알림 스키마를 확인하고 각 필드의 원천을 매핑한다. 없는 데이터를 임의 생성하지 않는다.
2. usage, trend, modelMix, teamUsage를 공통 집계 서비스에 구현한다. 같은 범위·cutoff·가격표·귀속 기준을 공유한다.
3. ingest와 계약 기반 seats, 현재 alerts를 연결한다. 제공하지 못하는 section은 명시적 unavailable/unknown으로 반환한다.
4. waste는 근거가 확보될 때 별도로 구현한다. 첫 응답부터 위 타입의 unavailable 형태를 지원한다.
5. 현재 기간과 비교 기간을 함께 조회/재사용한다. 카드마다 전체 이벤트를 반복 스캔하지 않는다.
6. 캐시를 적용하면 조직·권한 범위·날짜·타임존·비교·가격표/계약/팀 매핑 버전을 반영한다.
7. 기존 서버 아키텍처에 구현한다. 이 엔드포인트 때문에 GraphQL/Prometheus나 별도 서비스를 새로 추가할 필요는 없다.

필수 사용 집계 자체가 실패하면 5xx다. 계약/알림/낭비 등 독립적인 부가 지표만 실패하면
해당 section의 상태·reason을 포함한 200 응답을 허용한다.
정상 빈 기간도 200이며, 인증 누락 401, 권한 없음 403(또는 기존 서버의 리소스 은닉 정책),
잘못된 요청 400을 따른다. 오류 본문은 기존 공통 포맷을 우선 사용한다.

## 6. 수용 기준

- 선택 기간 금액 = 날짜별 금액 합 = 모든 모델 금액 합
  = 상위 3팀 금액 합 + otherTeams 금액 + 미배분 금액
  (모두 완전 관측·동일 가격 범위일 때, 서버 decimal 정밀도로 확인).
- 차트의 배분 좌석료 합 = seats.current.allocatedFeeUsd
  (계약/벤더 범위가 일치하고 지출을 표시 가능한 경우).
- 1일, 7일, 28일, 90일, 월 경계·연도 경계에서 날짜 포함 규칙이 동일하다.
- prev_week와 prev_period가 다른 기간을 조회하고, none은 비교 조회를 하지 않는다.
- 상위 팀 순위가 바뀌어도 이전 값은 동일 ID에 대응한다.
- 팀 이동/여러 설치/여러 도구가 있어도 조직 고유 사용자를 중복 합산하지 않는다.
- 이벤트 재전송·중복 수집이 비용/토큰/세션을 중복 증가시키지 않는다.
- 단가 누락, 계약 누락, 이전 값 0, 수집 전 기간, 실제 무사용 기간, 부분 관측, 수집 중단을 구분한다.
- 4개 이상의 팀에서도 topTeams 길이는 최대 3이며 미배분은 항상 별도 필드다.
- 다른 조직 ID 요청과 캐시 조회에 기존 권한 검사가 적용된다.

## 7. 프론트 연동 범위

현재 buildOverview는 표시용 문자열·색상·막대 폭을 생성하는 로컬 view model이다.
그 반환 타입 전체를 그대로 API 응답으로 만들지 않는다.

서버 담당: 원본 정규화, 중복 제거, 기간 집계, 가격/계약 적용, 귀속, 데이터 가용성, 낭비 추정.
프론트 담당: 통화/날짜 포맷, 색상·문구·막대 폭, 상위 모델 + 기타 표시,
유효한 값의 사용자당 수치·증감률·툴팁 조합.

연동 시 API DTO → view model 어댑터가 필요하다. 특히 null/부분 관측, 알림 미지원,
좌석 추정 지출, 모델 실효 단가, 커버리지의 사람/설치 단위 표시를 반영한다.
이 문서 작성으로 실제 API 호출이나 UI 동작을 변경하지는 않았다.

검토한 프론트 파일:
- src/lib/metrics/overview.ts
- src/lib/metrics/seat-economics.ts
- src/lib/metrics/activity.ts
- src/lib/filters.tsx
- src/components/overview/OverviewContent.tsx
- src/components/overview/TeamUsageTable.tsx
- src/components/overview/ModelMixCard.tsx
- src/components/overview/WasteCard.tsx
- src/components/layout/CoverageBar.tsx
