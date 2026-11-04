# 자동 구간 추이 (PROJ-317)

허브 ADR 0031과 Backend ADR 0077을 구현한다. 기존 일별 DTO와 PROJ-316 수집 현황·알림 계약은 유지한다. 공유 이벤트 fixture는 [auto-trend.fixture.json](../../tests/fixtures/auto-trend.fixture.json)이며 일별 수치를 시간 구간으로 분배한 자료가 아니다.

## 활성화와 복구

`NEXT_PUBLIC_AUTO_TREND_ENABLED=true`로 **빌드한** 프론트만 개요·팀 목록·팀 상세에 `bucket=auto`를 요청한다. 기본값은 `false`이며 PROJ-315 공통 정책 통합 검증 전 사용자 배포에서 활성화하지 않는다. 복구할 때도 이 호환 버전에서 `false`로 다시 빌드한다. 세션 탭 제거와 PROJ-316 파서는 유지된다. 현재 `collectionPolicy.status=pending`은 통합 완료를 뜻하지 않는다.

## 요청과 응답

개요, 팀 목록, 팀 상세는 `bucket=auto|day`를 받는다. 생략/`day`는 기존 일별 DTO다. 팀 사용자 API에는 `bucket`을 보내지 않으며 `snapshotId`의 집계 기준을 상속한다. 요청과 응답의 모드가 다르면 프론트는 응답을 버린다.

자동 공통 metadata:

```json
{
  "snapshotId": "snapshot-id",
  "trendAggregation": {
    "mode": "auto",
    "intervalSeconds": 3600,
    "valueMode": "interval",
    "rangeStart": "2026-11-03T15:00:00Z",
    "rangeEnd": "2026-11-04T15:00:00Z",
    "asOf": "2026-11-03T18:30:00Z"
  },
  "collectionPolicy": {
    "policyVersion": "proj-315-pending",
    "asOf": "2026-11-03T18:30:00Z",
    "status": "pending",
    "annotations": [
      {
        "scope": "period",
        "rangeStart": "2026-11-03T15:00:00Z",
        "rangeEnd": "2026-11-04T15:00:00Z",
        "teamId": null,
        "reasons": ["policy_integration_pending"],
        "evidenceRefs": []
      }
    ]
  }
}
```

팀 목록·상세·사용자의 `valueMode`는 `cumulative`다. `asOf`는 원천 이벤트 시각 상한 (`source_time < asOf`) 및 표시 기준이다. 수신 시각 기준 과거 복원을 뜻하지 않는다. 목록 다음 페이지·상세·사용자는 snapshot, 집계 metadata와 정책 metadata가 같아야 한다.

개요 `trend={bucket:"auto",points:[...]}`의 point는 `bucketStart`, `bucketEnd`, `temporalState`, `usageRows`, `pricedUsageRows`, `unpricedUsageRows`, `equivalentCostUsd`, `knownEquivalentCostUsd`, `totalTokens`다. 마지막 세 지표는 기존 `Value<T>`다.

팀 `trend`의 point는 같은 구간 필드와 `usageRows`, 누적 `pricedUsageRows`/`unpricedUsageRows`, `cumulativeEquivalentCostUsd`, `cumulativeKnownEquivalentCostUsd`, `cumulativeTotalTokens`, `cumulativeSessionCount`를 제공한다. 네 누적 지표는 모두 `Value<T>`이며 서버 값을 그대로 표시한다. `usageRows`만 해당 구간의 행 수다. 일별 `date`/`observation`을 자동 point에 섞지 않는다.

`temporalState`는 `elapsed`(종료 ≤ asOf), `in_progress`(시작 ≤ asOf < 종료), `upcoming`(asOf < 시작)이다. 미래의 모든 값과 행 수는 `null`이고 Value 사유는 `upcoming`이다. 빈 자동 기간도 시간축과 null 값을 반환한다. 앞서 확인한 누적값은 새 기록 없는 구간에서도 유지되며 클라이언트에서 재계산하지 않는다.

## 경계와 검증

KST `[startDate 00:00, endDate 다음 날 00:00)`를 기준으로 `[3600,10800,21600,43200,86400,259200,604800]` 중 `ceil(기간/간격) <= 60`인 최소 간격을 사용한다. 시작 자정에 맞추며 마지막 구간만 자른다. 프론트는 실제 간격, 연속성, 개수, 경계, 시간 상태, 정책 기준시각을 검증한다. 오늘 한 날짜도 24개 슬롯을 유지한다.

일별 완전성 상태를 자동 시간 구간에 복제하지 않는다. 미환산·세션 결손·토큰 의미 상태는 지표별로 표시하고 단순 보고 공백이 정상 값을 가리지 않게 한다. PROJ-316 손실은 서버 확인 시각의 payload 수이므로 사용 이벤트 구간에 분배하지 않는다.

## CSV와 검증 실행

CSV에는 mode·intervalSeconds·valueMode·timeZone·asOf·snapshot·정책 metadata와 구간 시작/종료/시간 상태/행 수/지표별 상태·사유를 기록한다. 금액은 서버 문자열을 보존하고 null은 빈 셀이다. `chart_trend`는 선택한 비용/토큰만 내보내며 다른 구역의 세션 열은 유지한다. 사용자 페이지에서 409 `snapshot_expired`가 나면 목록과 사용자 전 페이지를 새 snapshot으로 한 번 다시 읽는다.

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:browser:mock # flag=false 호환 경로, 3107
npm run test:browser:auto # flag=true 자동 경로, 3187
npm run test:e2e:auto # 격리 실제 API + 3187 브라우저
```

실제 API 검증은 Backend의 `PULSEMETRY_AUTO_TREND_BROWSER=true ./gradlew :apps:dashboard-api:test --tests '*AutoTrendBrowserHarnessTest' --rerun`가 준비하는 Testcontainers 스택과 `/tmp/proj317-browser-api.json`을 사용한다. 다른 경로는 `AUTO_TREND_API_CONFIG`로 지정한다. 브라우저 로그인 참조 쿠키와 onboarding은 테스트 fixture이며, dashboard 전달 계층은 테스트 인증 헤더를 붙여 **실제 HTTP API 응답**을 통과시킨다. 실제 SQL 집계·snapshot·상세·사용자·CSV는 검증하지만 운영 SSO/Valkey 인증 통합 검증을 대체하지 않는다. 기존 사용자 서비스와 DB를 변경하지 않는다.
