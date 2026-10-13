# 운영·보안 및 헤더 알림 조회

운영·보안과 공통 헤더 드로어는 `GET /api/v1/organizations/{organizationId}/alerts`를 공유한다. 보안 페이지는 `category=security`를 지정한다. 상태 필터·20건 페이지네이션·상세·확인 흐름은 유지한다.

```ts
type AlertsPage = {
  meta: { organizationId: string; asOf: string; snapshotId: string };
  evaluation: {
    status: "complete" | "partial" | "unavailable";
    reasons: string[];
    asOf: string | null;
  };
  alerts: { items: Alert[]; totalCount: number; nextCursor: string | null };
};
type AlertEvidence =
  | { kind: "usage"; targetName: string }
  | {
      kind: "spend";
      startDate: string;
      endDate: string;
      currentCostUsd: string;
      previousCostUsd: string;
      increaseRatio: number;
    }
  | null;
```

알림의 `summary`를 타입이 정해진 `evidence`로 대체한다. 상세에서 쓰는 규칙·대상·시각·묶음 구간·위반 수·구성원·확인 시각과 확인 명령의 `version`은 유지한다. 목록의 `acknowledgement`는 `{acknowledgedAt}`만 포함한다. 확인 명령 응답의 확인자 ID는 유지한다.

평가 요약은 요청 범주의 현재 규칙을 대상으로 한다. 미평가·실패를 0건으로 표시하지 않으며, 빈 미확인 목록에서는 서버 사유를 보여 준다. 과거 알림은 평가 상태와 관계없이 계속 조회·확인할 수 있다. 별도의 검사 정보나 규칙별 평가 영역을 추가하지 않는다.

- `complete`: 해당 범주에 평가 이력이 있고 현재 켜진 규칙 모두 평가됨.
- `partial`: 현재 켜진 규칙 중 정상 평가와 미평가·실패가 섞임.
- `unavailable`: 현재 켜진 규칙의 정상 평가가 없거나 평가 이력이 없음.
- 사유: `evaluation_pending`, `evaluation_not_configured`, 저장된 `not_evaluated`·`failed` 사유.

목록의 `asOf`는 페이지 기준 시각, 평가의 `asOf`는 마지막 평가 시각이다. 다음 페이지는 같은 snapshot과 필터를 사용하고, 조직/스냅샷이 맞지 않으면 응답을 거부한다. CSV는 같은 필터의 전체 알림, 화면 요약·상세 값과 평가 상태·사유를 내보낸다. 숨겨진 규칙별 기록은 내보내지 않는다.

백엔드 [알림 계약](../../../pulsemetry-backend/docs/api/reference/alerts.md)과 함께 반영한다.

## 만료 계약 알림

공통 알림 드로어는 [계약 입력·만료 현황](contract-input-status-api.md)을 함께 읽는다. 종의 건수는 미확인 보안·비용 알림 수와 `expiredCount`의 합계다. 계약 미입력 수는 헤더의 기존 안내로 유지하고 종에 더하지 않는다.

만료된 계약은 `미확인`·`전체` 탭에 벤더 이름과 종료일, `계약 갱신` 링크로 표시한다. 링크는 `/settings?vendor={vendorId}`로 이동해 해당 계약 폼을 열며 알림 드로어를 닫는다. 별도 확인 버튼·확인 이력은 없고, 계약 저장 후 현재 상태가 만료에서 벗어나면 조회 캐시 갱신으로 사라진다. `확인함` 탭과 운영·보안 목록·알림 CSV에는 계약 만료를 넣지 않는다.

계약 상태와 보안·비용 알림은 독립적으로 조회한다. 한쪽이 실패해도 정상 목록은 유지하고 실패 영역 안에서 재시도한다. 합계를 확정할 수 없는 동안 종은 `…` 또는 `!`를 표시하며 0건으로 대체하지 않는다.
