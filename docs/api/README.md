# 화면별 API 구현 요청서

상태: **프론트 화면을 기준으로 작성한 v1 제안**. 구현 완료된 서버 API 목록이 아니다.
기존 백엔드의 인증·라우팅·오류 규약이 있으면 우선 적용하고 DTO와 의미를 함께 조정한다.

범위는 개요, 팀 분석, 구성원, 설정이다. **운영·보안 페이지의 조회/조작 API는 제외**한다.
설정 화면에 있는 수집 정책과 알림 규칙은 포함한다.
로그인은 현재 라우트/안내 문구만 있는 상태이므로 IdP 프로토콜을 새로 설계하지 않는다.
기존 로그인/세션에서 사용자 ID, 조직 ID, 역할·조회 범위를 공급받는 것을 공통 선행 조건으로 둔다.

## 전달할 문서

| 화면 | 명세 | 응답 예시 |
| --- | --- | --- |
| 개요 | [overview-api.md](overview-api.md) | [overview-response.example.json](overview-response.example.json) |
| 팀 분석 | [teams-api.md](teams-api.md) | [teams-response.example.json](teams-response.example.json), [team-users-response.example.json](team-users-response.example.json) |
| 구성원 | [members-api.md](members-api.md) | [members-response.example.json](members-response.example.json) |
| 설정 | [settings-api.md](settings-api.md) | [settings-response.example.json](settings-response.example.json) |

예시는 가상의 ID·계정·금액을 쓴 계약 설명용 데이터다. 실제 조직이나 실제 벤더 요금표가 아니다.
서로 다른 화면 예시는 독립된 조회 시나리오이며, 개요와 팀 분석의 조직 사용 합계만 의도적으로 맞췄다.

## API 구성

모든 아래 경로의 앞에는 `/api/v1/organizations/{organizationId}`가 붙는다.

| 용도 | Method / path | 호출 시점 |
| --- | --- | --- |
| 개요 | GET /analytics/overview | 진입·기간/비교 변경 |
| 팀 분석 | GET /analytics/teams | 진입·기간/비교/정렬·팀 목록 페이지 변경 |
| 팀 드로어 | GET /analytics/teams/{teamId} | 목록에 없는 팀 상세 필요 시 |
| 팀 사용자 | GET /analytics/teams/{teamId}/users | 선택 팀 변경·더보기 |
| 조직 팀 선택지 | GET /teams | 배정/초대·팀 검색 |
| 구성원 첫 화면 | GET /members/dashboard | 진입·기간 변경 |
| 구성원 목록 | GET /members | 검색·더보기 |
| 미배정 목록 | GET /members/unassigned | 더보기 |
| 회수 후보 | GET /seat-reclaim-candidates | 더보기·기준 변경 후 |
| 팀 배정 | POST /member-team-assignments | 적용 |
| 초대 | POST /invitations/batch | 초대 전송 |
| 좌석 회수 미리보기 | POST /seat-reclaims/preview | 회수 확인창 열기 |
| 좌석 회수 | POST /seat-reclaims | 회수 확정 |
| 회수 복원 | POST /seat-reclaims/{operationId}/restore | 되돌리기 |
| 비동기 작업 상태 | GET /operations/{operationId} | 실행 중인 회수/복원/알림/삭제 확인 |
| 설정 첫 화면 | GET /settings | 진입·저장 후 재조회 |
| 벤더 목록 | GET /vendors | 목록 더보기 |
| 벤더 상세 | GET /vendors/{vendorId} | 목록에 없는 벤더 편집 |
| 수동 벤더 추가 | POST /vendors | 추가 저장 |
| 벤더 계약 저장 | PUT /vendors/{vendorId}/contract | 계약 저장 |
| 감지 벤더 계약 해제 | DELETE /vendors/{vendorId}/contract | 계약 삭제 확인 |
| 수동 벤더 제거 | DELETE /vendors/{vendorId} | 벤더 삭제 확인 |
| 수집 정책 변경 | PATCH /settings/collection-policy | 확인/선택 적용 |
| 알림 규칙 변경 | PATCH /settings/alert-rules/{ruleId} | 토글 |
| 미적용 설치 | GET /installations?policyStatus=outdated | 설치 현황 모달·더보기 |
| 업데이트 안내 | POST /installation-update-notifications | 안내 전송 |

`operations`는 비동기 명령 결과를 읽는 공통 리소스다. 제외한 운영·보안 화면의 API가 아니다.
처음부터 카드마다 엔드포인트를 만들지 않는다. 각 화면 첫 조회가 필요한 요약과 목록 첫 페이지를 묶어 주고,
사용자가 목록을 넘기거나 저장할 때 추가 호출한다. 팀 사용자 표는 권한·선택 팀이 달라 별도 조회한다.
초기 선택 팀은 팀 분석 응답 첫 행(없으면 미배정)으로 정한다. 사용량이 없으면 사용자 표도 빈 상태다.

## 공통 조회 계약

- 날짜, USD 금액, 토큰 정규화, 데이터 부재, 비교 기준은 [개요 명세](overview-api.md)의 2~4절을 따른다.
- 기간 조회: startDate/endDate 필수, 종료일 포함, 1~366일, timeZone 기본/지원값 Asia/Seoul.
- compare는 개요·팀 분석만 지원한다. 구성원에는 비교 카드가 없고 설정은 선택 기간과 무관한 현재 상태다.
- 팀 ID/구성원 ID/벤더 ID/좌석 배정 ID는 서버의 불변 ID다. 화면 이름이나 이메일을 기본 키로 쓰지 않는다.
- analytics의 `teamId=unassigned`는 실제 팀 ID로 쓸 수 없는 예약 경로값이다. DTO의 미배정 teamId는 null.
- 멤버 현재 팀과 이벤트 당시 귀속 팀은 서로 다른 개념이다. 배정 이후 과거 비용을 자동으로 옮기지 않는다.
- 각 목록은 cursor 기반. limit 기본값은 개별 문서, 최대 100(팀 분석은 50). 잘못된 cursor/limit은 400.
- nextCursor=null이면 끝. totalCount는 권한과 검색 필터를 적용한 전체 행 수, items.length와 다르다.
- 정렬은 지정 지표 내림차순 + 불변 ID 오름차순. null은 마지막. 목록 도중 순서·중복이 바뀌지 않도록 snapshotId로 조회 버전을 고정한다.
- snapshotId는 불투명 문자열, 기본 유효기간 10분 제안. 날짜·권한·필터가 바뀌면 새 조회.
  cursor는 원 요청의 필터·정렬·snapshotId에 묶인다. 만료는 409 snapshot_expired → 첫 페이지부터 재조회.
- snapshotId가 고정하는 것은 사용 데이터 cutoff, 가격/계약/팀 매핑 버전과 목록 순서다.
  ingest.asOf 등 현재 수집 상태는 별도 시점이며, 쓰기 시 자격·권한은 다시 확인한다.
- 개요는 목록 페이지 이동이 없어 기존 dataThrough 계약을 유지한다. 동일 cutoff/버전/권한으로 조회했을 때 화면 간 합계가 같아야 한다.
- 개인 목록은 서버가 권한을 검사한다. UI에서 숨기는 것만으로 접근을 제한하지 않는다.
  팀 리드가 볼 수 있는 팀 범위, 일반 구성원이 개인 목록을 볼 수 있는지는 기존 RBAC와 합의한다.
  제한된 범위의 합계를 전사 합계라고 표시하지 않는다.

공통 타입. OverviewResponse와 Usage 등은 overview-api.md의 타입을 참조한다.

```ts
type Page<T> = {
  items: T[];
  totalCount: number;
  nextCursor: string | null;
};
type Section<T> = {
  availability: Availability;
  reason: string | null;
  data: T | null;
};
type AnalyticsMeta = OverviewResponse["meta"] & { snapshotId: string };
type CurrentMeta = {
  organizationId: string;
  generatedAt: string;
  asOf: string;
  snapshotId: string;
  currency: "USD";
  timeZone: "Asia/Seoul";
};
type TeamRef = { teamId: string | null; teamName: string };
type Role = "admin" | "lead" | "member" | "viewer";
type OperationResponse = {
  operationId: string;
  kind: "seat_reclaim" | "seat_restore" | "installation_notification" | "retention_cleanup";
  status: "pending" | "running" | "succeeded" | "partially_failed" | "failed";
  createdAt: string;
  completedAt: string | null;
  results: {
    targetId: string;
    status: "pending" | "succeeded" | "failed";
    reason: string | null;
  }[];
  canRestore: boolean;
  restoreUntil: string | null;
};
type TeamDirectoryResponse = {
  meta: CurrentMeta;
  teams: Page<{ teamId: string; teamName: string; version: number }>;
};
```

GET /teams는 q(이름 검색, 최대 200자), limit(기본 50), cursor, snapshotId를 지원한다.
활성 실제 팀만 반환하고 미배정은 포함하지 않는다. 같은 선택지를 구성원 초대/배정에서 재사용한다.
팀 분석의 과거 팀은 사용 이력의 팀 이름으로 제공하므로 현재 디렉터리에서 사라져도 집계에서 누락하지 않는다.

## 공통 쓰기 계약

- 권한은 서버에서 검증. reviewedBy/actorId/organizationId를 본문에서 받아 믿지 않는다.
- POST 명령은 Idempotency-Key 필수. 조직·사용자·경로·본문 해시에 묶어 24시간 재시도 결과를 재사용한다.
  같은 키/다른 본문은 409. 전송 중복으로 초대나 좌석 변경을 중복 실행하지 않는다.
- 저장/삭제는 문서에 지정한 version 또는 If-Match로 낙관적 잠금. 불일치는 409 version_conflict.
  UI는 최신 값을 보여 주고 재확인을 받아야 한다.
- 202는 작업 접수다. 완료 표시·절감액 확정·알림 발송 완료를 즉시 표시하지 않는다.
  Location은 조직 범위의 /operations/{operationId}. 2초 간격으로 조회하고 Retry-After가 있으면 우선한다.
- operations 조회는 같은 조직/권한을 검사하고 OperationResponse를 반환한다.
  partially_failed이면 성공/실패 대상별로 UI에 표시한다. 되돌리기는 canRestore=true일 때만 노출한다.
- 오류 본문은 기존 서버 규약 우선. 규약이 없으면
  `{ "error": { "code": "version_conflict", "message": "...", "fieldErrors": [] }, "requestId": "..." }`
  형태 제안. fieldErrors 항목은 `{ field: string, code: string }`.
- 400 잘못된 형식, 401 미인증, 403 권한, 404 대상 없음, 409 충돌/스냅샷 만료,
  422 유효하지 않은 업무 조건, 429 호출 제한, 5xx 서버 실패.
- 성공 후 관련 화면 캐시를 무효화한다. 실패한 저장을 UI에서 완료 처리하지 않는다.
- 선택 기능 미구현은 availability=unavailable + reason과 disabled action으로 전달한다.
  없는 외부 벤더 제어 기능을 로컬 DB 플래그 변경만으로 “좌석 회수 성공”이라고 처리하지 않는다.

## 백엔드 데이터 원천

| 원천 | 필요한 정보 |
| --- | --- |
| 정규화 사용 이벤트 | event/request ID, occurredAt, canonical user ID, session ID와 도구, 모델 ID, 중복 없는 토큰 범주, 이벤트 당시 대표 팀 |
| 조직/IdP | 실제 구성원 로스터, 현재 팀, 역할, 활성/비활성 상태, 초대 상태 |
| 계약·좌석 저장소 | 벤더별 계약 이력, 유효 기간, 등급별 좌석·요금, 실제 좌석 배정과 회수 가능 조건 |
| 가격표 | 모델/토큰 종류별 이벤트 시점 유효 단가·버전 |
| 수집 제어면 | 설치별 heartbeat, 지원 정책 버전, 실제 적용 버전, 수신 시각, 관측 누락 구간 |
| 정책·알림 | 정책 버전/적용 시점, 알림 규칙/평가 창, 전송 또는 집계 삭제 작업 결과 |

텔레메트리만으로 계약, 역할, 미사용 좌석 또는 초대 가능 여부를 만들어내지 않는다.
현재 프론트의 랜덤 사용자 생성, 상수 회수 후보 수, 가짜 발송 성공 상태는 서버 구현 사양이 아니다.

## 구현 순서 / 완료 기준

1. 기존 스키마를 위 원천에 매핑하고 지원 불가능한 항목을 availability로 명시한다.
2. 공통 집계 서비스를 만들고 개요 → 팀 분석 조회를 구현한다. 날짜·귀속·가격 규칙은 공유한다.
3. 실제 로스터 기반 구성원 조회, 현재 계약/정책 기반 설정 조회를 붙인다.
4. 권한·버전 검사와 함께 초대/배정/계약/정책 저장을 구현한다.
5. 외부 제어 연동이 가능한 경우 회수/복원/안내 전송을 구현한다. 불가능하면 해당 버튼을 비활성화한다.
6. 각 문서의 수용 기준과 전체/부분/빈 데이터, 권한, 동시 변경, 중복 명령을 검증한다.

여러 HTTP 호출 개수보다 같은 원본을 중복 스캔하는지, 응답에 불필요한 전체 명단을 담는지가 중요하다.
기존 서버 안에서 공통 집계·병렬 조회·캐시를 사용한다. 이 명세를 위해 GraphQL이나 Prometheus를 새로 도입할 필요는 없다.

프론트 연동은 별도 작업이다. 이 문서들은 API 호출, 외부 메일 전송, 좌석 회수 또는 정책 변경을 실행하지 않는다.
