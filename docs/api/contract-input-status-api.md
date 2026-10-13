# 계약 입력·만료 현황

`GET /api/v1/organizations/{organizationId}/contract-input-status`는 선택 기간과 무관한 현재 계약 상태를 반환한다. 공통 헤더와 알림 종·드로어가 같은 조직 쿼리 캐시를 공유한다. 알림을 위해 설정 전체나 벤더 상세를 먼저 조회하지 않는다.

```ts
type ContractInputStatus = {
  organizationId: string;
  asOf: string;
  requiredCount: number;
  vendors: {
    vendorId: string;
    displayName: string;
    missingFields: string[];
  }[];
  expiredCount: number;
  expiredContracts: {
    vendorId: string;
    displayName: string;
    endDate: string; // YYYY-MM-DD, 종료일 포함
  }[];
};
```

- `requiredCount`·`vendors`는 기존 계약 미입력 안내다. 등록 계약이 없는 벤더만 포함하며 만료·시작 예정·0달러 계약은 세지 않는다.
- `expiredCount`·`expiredContracts`는 현재 선택된 계약의 종료일이 한국 시간 오늘보다 이전인 벤더다. 종료 당일은 유효하며, 시작 예정 계약은 만료에 포함하지 않는다.
- 두 건수는 각 목록 길이와 같고 각 목록 안의 벤더 ID는 중복되지 않는다. 프론트는 잘못된 건수·날짜·조직 응답을 조회 오류로 처리한다. 필드 누락을 0건으로 대체하지 않는다.
- 종에는 미확인 보안·비용 알림 수와 `expiredCount`를 더한다. 드로어 `미확인`·`전체` 탭에 만료 계약과 종료일을 표시한다. 확인 이력을 만들지 않으므로 `확인함`에는 표시하지 않는다.
- `계약 갱신` 링크는 `/settings?vendor={URL 인코딩한 vendorId}`로 이동해 기존 계약 폼을 연다. 계약 폼은 해당 벤더 상세를 조회하고 현재 계약 저장 API를 사용한다. 별도의 갱신 명령은 만들지 않는다.
- 저장 성공 후 조직 쿼리를 무효화하며, 재조회 결과에서 만료가 해소되면 안내와 종의 건수에서 제거한다. 계약 상태 조회 실패는 드로어 내 독립 재시도를 제공하고 정상 보안·비용 알림을 유지한다.

[응답 예시](contract-input-status-response.example.json), [알림 표시 계약](alerts-api.md), [설정 계약](settings-api.md), [허브 ADR 0020](../../../docs/adr/0020-expired-contract-notifications.md).
