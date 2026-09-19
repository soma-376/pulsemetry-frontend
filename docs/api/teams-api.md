# 팀 분석 API — v1 제안

공통 규칙은 [README](README.md), 기간/비교/금액/관측 의미는 [개요](overview-api.md)를 따른다.
현 화면: TeamAxisPanel, ModelScatterCard, TeamModelMixCard, UserUsageCard, TeamDetailDrawer.
응답은 표시 문자열이 아닌 원시 수치다. 현재 buildTeams/buildRoster의 임의 사용자 생성·비용 비례 토큰 배분은 구현하지 않는다.

## 조회

기본 경로: /api/v1/organizations/{organizationId}

| 요청 | 쿼리/응답 |
| --- | --- |
| GET /analytics/teams | startDate, endDate, compare, timeZone + sort=cost/token/session(기본 cost), limit=20(최대 50), cursor, snapshotId → TeamsResponse |
| GET /analytics/teams/{teamId} | 같은 기간·비교·snapshotId → TeamDetailResponse |
| GET /analytics/teams/{teamId}/users | startDate, endDate, timeZone, snapshotId, limit=12(최대 100), cursor → TeamUsersResponse |

첫 조회는 조직 합계·모델 산점도·팀 목록 첫 페이지·그 팀들의 추이/모델 믹스를 함께 반환한다.
행에 드로어 데이터가 있으므로 동일 snapshot에서는 다시 조회하지 않는다. 직접 링크로 팀을 열 때만 상세 GET.
사용자 표는 선택한 팀의 첫 페이지를 별도 요청한다. API 응답 캐시는 기간·snapshot·팀에 묶는다.
팀이 많아지면 목록/팀 선택기를 페이지 또는 검색 UI로 전환한다. 모든 팀×날짜×사용자를 한 응답에 싣지 않는다.
미배정은 teams.items에 섞지 않고 unassigned로 반환한다. 상세/사용자 경로에는 예약값 unassigned를 사용한다.

```ts
type TeamModelUsage = {
  modelId: string;
  displayName: string;
  equivalentCostUsd: Money | null;
  totalTokens: number | null;
};
type TeamAnalytics = TeamRef & {
  current: Usage | null;
  previous: Usage | null;
  modelMix: Section<{
    sessionMixAvailable: false;
    sessionMixReason: "multi_model_sessions";
    models: TeamModelUsage[];
  }>;
  trend: {
    date: string;
    observation: Observation;
    equivalentCostUsd: Money | null;
    totalTokens: number | null;
    cumulativeSessionCount: number | null;
  }[];
};
type TeamsResponse = {
  meta: AnalyticsMeta;
  comparison: OverviewResponse["comparison"];
  ingest: OverviewResponse["ingest"];
  attributionBasis: "event_time";
  totals: OverviewResponse["usage"];
  sort: "cost" | "token" | "session";
  teams: Page<TeamAnalytics>;
  unassigned: TeamAnalytics;
  modelScatter: Section<{
    teamUsageCostShareThreshold: number;
    models: (TeamModelUsage & { usingTeamCount: number | null })[];
  }>;
};
type TeamDetailResponse = {
  meta: AnalyticsMeta;
  comparison: OverviewResponse["comparison"];
  team: TeamAnalytics;
};
type TeamUser = {
  memberId: string;
  account: string;
  usage: Usage;
  mainModel: { modelId: string; displayName: string } | null;
  cache: { readTokens: number | null; eligibleInputTokens: number | null; hitRatio: number | null };
  lastUsedAt: string | null;
};
type TeamUsersResponse = {
  meta: AnalyticsMeta;
  team: TeamRef;
  summary: {
    usage: Usage | null;
    averageEquivalentCostUsd: Money | null;
    cacheReadTokens: number | null;
    cacheEligibleInputTokens: number | null;
    cacheHitRatio: number | null;
    unidentifiedEquivalentCostUsd: Money | null;
  };
  users: Page<TeamUser>;
};
```

## 화면과 필드 대응

| UI | 데이터 / 계산 |
| --- | --- |
| 비용 탭 | totals.current.equivalentCostUsd, 팀 current.equivalentCostUsd |
| 토큰 탭 | totals.current.tokens.total, 팀 current.tokens.total |
| 세션 탭 | totals.current.sessionCount, 팀 current.sessionCount |
| 사용자당 | 팀 선택 지표 / 팀 activeUsers |
| 비용 탭 세션당 | equivalentCostUsd / sessionCount |
| 토큰 탭 백만당 비용 | equivalentCostUsd / tokens.total × 1,000,000 |
| 세션 탭 세션당 토큰 | tokens.total / sessionCount |
| 전주/이전 기간 증감 | 동일 팀 current/previous. 비교 비활성·미관측·이전 0의 처리는 개요 규칙 |
| 누적 추이 | 비용/토큰은 일별 값을 누적. 세션은 cumulativeSessionCount 직접 사용 |
| 모델 산점도 | x=totalTokens, y=equivalentCostUsd, 점 크기=usingTeamCount |
| 팀별 모델 구성 | 비용이면 모델 금액 비중, 토큰이면 모델 토큰 비중 |
| 사용자 표 | users.items + summary. 비용 내림차순, 동률 memberId |
| 평균 대비 | (개인 금액 / summary.averageEquivalentCostUsd) - 1 |
| 드로어 증가 기여 | current.equivalentCostUsd - previous.equivalentCostUsd |
| 드로어 주요 모델 | 모델 금액 내림차순과 해당 팀 금액 대비 비중 |

분모 0이나 필요한 값이 null이면 파생값도 null이다. 미배정은 일반 팀과 같은 수치 구조지만 ID는 null이다.
팀 체크박스는 차트의 선 표시만 바꾸며 전체 합계와 분모를 바꾸지 않는다.

## 집계 기준

- 조직 totals와 modelScatter는 현재 목록 페이지와 무관한 권한 범위 전체 집계다.
- teams.totalCount는 해당 기간에 사용이 있는 실제 팀 수다. 미배정 제외.
  무사용 기간에는 teams.items=[], 총계는 실제 0 또는 미관측 null로 구분한다.
- 팀 비용·토큰은 이벤트 당시 대표 팀에 한 번만 귀속한다. 개요 상위 3팀과 같은 집계 서비스를 사용한다.
- 사용자 고유 수, 세션 고유 수는 팀 이동/여러 모델 때문에 팀·날짜·모델 간 합산할 수 없다.
  조직 sessionCount는 조직 범위 distinct로 계산한다.
- 세션 추이는 요청 시작부터 각 날짜 끝까지 해당 팀 이벤트의 session ID distinct다.
  단순 일별 distinct 합산을 누적 세션으로 쓰지 않는다.
- 모델별 한 세션이 여러 모델을 사용하면 모델 세션 수 합이 팀 세션 수를 초과할 수 있다.
  v1의 세션 축 모델 믹스는 미지원으로 명시한다. UI는 비용/토큰만 제공하거나 안내 상태를 표시한다.
  비용 비중으로 세션·토큰 수를 임의 배분하지 않는다.
- 산점도 usingTeamCount는 해당 모델 비용이 그 팀 비용의 5% 이상인 실제 팀 수(미배정 제외).
  응답의 threshold=0.05로 명시하고 단가가 누락되면 null. 전체 조직 모델 수치에 미배정 사용은 포함한다.
- 사용자 목록은 해당 기간·귀속 팀의 실제 사용자를 canonical member ID로 묶는다.
  현재 로스터에서 팀을 이동했다고 과거 개인 사용 기록의 팀을 바꾸지 않는다.
- mainModel은 해당 사용자 비용이 가장 큰 모델, 동률 modelId 순. 금액 산출 불가 시 null.
- cacheHitRatio = cacheRead / cacheEligibleInput. eligibleInput은 정규화된 inputUncached+cacheRead+cacheWrite.
  해당 공급자가 이 범주를 제공하지 않거나 분모 0이면 null. 사용자 비율 평균으로 팀 비율을 만들지 않는다.
- lastUsedAt은 선택 기간 안 해당 팀의 마지막 유효 사용 시각. 구성원 페이지의 현재까지 마지막 사용과 다르다.
- summary는 사용자 전체 페이지 기준이다. 평균 분모는 식별 가능한 활성 사용자 수,
  분자는 식별 가능한 사용자 비용 합계다. 미식별 이벤트 비용은 unidentifiedEquivalentCostUsd에 별도 표시한다.
- 비용 합계 = 모든 사용자 페이지 비용 합계 + 미식별 비용(완전 관측일 때).
  세션이 여러 사용자를 포함하면 개인별 distinct 합은 팀 sessionCount와 다를 수 있다.
- 추이에 모든 날짜를 포함한다. 관측 공백 이후 누적값을 확정 총액처럼 연결하지 않는다.
  cumulativeSessionCount는 시작부터 해당일까지 관측이 불완전하면 null이다.

## 권한·빈 상태·수용 기준

개인 사용 조회 권한이 없으면 사용자 endpoint는 403이며 집계 화면은 계속 표시할 수 있다.
팀 자체 권한이 없으면 상세도 403/404. 다른 조직의 teamId/memberId가 섞이지 않아야 한다.
no_data/never_observed에서도 팀 디렉터리와 실제 구성원 관리 기능은 별개로 유지한다.

- 같은 범위/버전의 totals는 개요 usage와 일치한다.
- 3팀 초과·50팀 초과에서도 페이지 밖 팀의 비용이 합계/산점도에서 빠지지 않는다.
- 정렬/기간 변경은 cursor를 초기화하고 같은 snapshot의 페이지 간 중복·누락이 없다.
- 팀 이동, 하루를 넘는 세션, 여러 모델 세션, 미식별 사용자, 단가 누락을 검증한다.
- 드로어는 선택한 팀의 ID와 동일 기간을 유지한다. 이전 요청이 늦게 끝나도 새 팀 내용을 덮지 않는다.
- 비용/토큰 믹스는 각자의 실제 수치를 사용하며 sessionMixAvailable=false를 UI에 반영한다.

예시: [팀 분석](teams-response.example.json), [선택 팀 사용자](team-users-response.example.json).
