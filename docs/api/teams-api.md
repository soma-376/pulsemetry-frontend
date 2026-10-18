# 팀 분석 API

단일 snapshot에서 팀 비교·추이·모델 분포를 읽고, 선택한 팀의 구성원은 별도 페이지로 읽는다. 서버가 값의 상태와 증감을 판정한다. 프론트는 단위를 표시하고 차트 좌표·팀 비교 표 정렬을 만든다. 사용자 표 정렬은 서버에서 처리한다.

## 요청

- `GET /api/v1/organizations/{organizationId}/analytics/teams`: `startDate`, `endDate`, `timeZone=Asia/Seoul`, `compare=none|prev_week|prev_period`, `sort=cost|token|session`, `limit`, `offset`, `snapshotId`.
- `GET .../analytics/teams/{teamId}`: 같은 기간·비교·snapshot. 미배정 경로는 `unassigned`.
- `GET .../analytics/teams/{teamId}/users`: 같은 기간·snapshot, `limit`, `offset`, `sort=cost|averageDeviation|account|session|token|cache|lastUsed`, `order=asc|desc`. 기본값은 비용 내림차순이며 동률은 구성원 ID 오름차순이다. 평균 대비는 개인 비용 / 선택 팀 전체 식별 사용자 평균 − 1의 순서다. 평균이 확인 불가이거나 응답 평균이 0이면 비교 불가이며, 양방향 모두 구성원 ID 순으로 표시한다. offset은 기본 0이며 후속 페이지는 snapshotId와 정렬 조건을 유지한다. 조건 변경 시 offset=0부터 요청한다.

현재 팀 관리 명단 `GET .../teams`와 생성·수정 명령은 별도 계약을 유지한다. 사용량 귀속은 관측 당시 대표 팀이다.

## 팀 목록 응답

`meta`, `comparison`, `attributionBasis`, `totals`, `sort`, `teams`, `unassigned`, `modelScatter`를 반환한다. `meta`는 조직·기간·시간대·일수·확정 시각·데이터 상태·관측 일수·snapshot ID다. 헤더 수집 상태와 가격 판 상세는 포함하지 않는다.

`teams`는 `{items,totalCount,nextOffset}`다. 각 항목과 미배정은 `{teamId,teamName,metrics,modelMix,trend,products}`다. `current/previous` 범용 사용량은 반환하지 않는다.

`metrics`의 값:

| 필드                             | 의미                | 비교 |
| -------------------------------- | ------------------- | ---- |
| activeUsers                      | 식별된 활성 사용자  | 없음 |
| equivalentCostUsd                | 사용 환산액         | 있음 |
| totalTokens                      | 합산 가능한 총 토큰 | 있음 |
| sessionCount                     | 식별된 세션         | 있음 |
| equivalentCostPerUserUsd         | 사용자당 환산액     | 있음 |
| equivalentCostPerSessionUsd      | 세션당 환산액       | 없음 |
| tokensPerUser                    | 사용자당 토큰       | 없음 |
| sessionsPerUser                  | 사용자당 세션       | 없음 |
| tokensPerSession                 | 세션당 토큰         | 없음 |
| effectiveCostPerMillionTokensUsd | 백만 토큰당 환산액  | 없음 |

모든 값은 `{value,status,reasons}`다. `status`는 `complete|partial|unavailable`이다. 비교가 있으면 `comparison={status,reasons,previousValue,absoluteChange,percentChange,change}`를 포함한다. `change`는 `increase|decrease|unchanged|new`, 비교 상태는 `available|unavailable|disabled`다. 미식별 사용량을 식별된 인원으로 나누지 않는다. 분모 0이면 `zero_denominator`로 값을 비운다. 불완전한 현재·비교 기간은 증감을 만들지 않는다.

`totals`는 동일한 `metrics` 구조로 전사 범위에서 계산한다. 페이지에 보이는 팀 합을 조직 합계로 대신하지 않는다.

`trend`는 날짜·관측 상태·일별 비용·토큰·기간 시작일부터의 고유 누적 세션을 반환한다. 일별 고유 세션을 합산하지 않는다. 모델·날짜별 `status/reasons`로 수집 불완전·단가·토큰·누적 근거 부족을 보존한다. 비용·토큰 누적선은 값이 없는 날짜부터 끊는다.

관측 부분합 계약은 `metrics`와 `totals`에 `knownEquivalentCostUsd: Value<string>`, `pricedUsageRows: number`, `unpricedUsageRows: number`를 추가한다. `trend[]`는 동일한 행수와 `knownEquivalentCostUsd: string|null`을 제공한다. 프론트는 이전 fixture와의 호환을 위해 추가 필드를 optional로 읽는다. 부분합은 같은 가격 판에서 계산 가능한 관측만 더한 값이며 공식 환산액·평균·비중을 대체하지 않는다.

비용·토큰의 별도 ‘확인된 값 누적’ 모드는 확인 가능한 날의 값을 더하고 공백 뒤에서 재개한다. 미관측·미확인 날짜는 null로 남기고 선택 기간 전체의 하한임을 표시한다. 비용은 추가 부분합 필드를 사용하며 필드가 생략된 구 응답에서는 기존 일별 금액을 쓴다. 명시적인 null은 기존 금액으로 대체하지 않고, 기간의 가격 판이 혼재하면 비용 부분합 누적을 만들지 않는다. 세션은 이 모드를 지원하지 않는다. CSV에는 원시 추가 필드와 선택한 모드의 `chart_trend`를 함께 기록한다.

`products`는 화면의 제품별 비중에 필요한 제품 이름·비용·토큰·세션·활성 사용자다. `modelMix`와 `modelScatter`는 현재 선택 기간의 모델 값과 가용성을 제공한다. 값이 없는 모델은 점으로 그리지 않는다.

## 선택 팀의 사용자

`meta`, `team`, `summary`, `users`를 반환한다. `summary.usage`는 활성 사용자·세션·총 토큰·비용 Value다. 식별 사용자 평균 비용, 캐시 적중률 Value와 미식별 비용을 포함한다.

사용자 행은 구성원 ID·계정·사용 값(세션·총 토큰·비용 Value)·주요 모델·캐시 적중률 Value·마지막 사용 시각만 반환한다. 캐시 읽기/분모 토큰과 사용하지 않는 토큰 세부는 제외한다.

## 상태와 검증

- 0은 확인된 0, null은 값 확인 불가다. 사용량이 없는 기간은 공통 기간 빈 상태를 사용한다.
- 후속 페이지·상세·사용자 응답의 조직·기간·snapshot을 검사한다. 만료 snapshot은 첫 페이지부터 한 번 다시 읽고, 서로 다른 snapshot을 합치지 않는다.
- 최초 조회 실패와 갱신 실패는 공통 조회 규칙을 따른다. 지표의 부분 관측은 네트워크 실패가 아니다.
- CSV는 팀 지표·상태·사유·증감·추이·제품 비중·모델 및 선택한 팀의 사용자 값을 보존한다.

[팀 목록 예시](teams-response.example.json) · [사용자 예시](team-users-response.example.json)
