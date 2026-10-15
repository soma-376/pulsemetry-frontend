# 구성원 API — 화면 전용 응답

[공통 계약](README.md)과 [개요의 기간·단위 규칙](overview-api.md)을 따른다.
현 화면: MembersContent, MemberListCard, UnassignedCard, SeatReclaimCard, InviteModal.
실제 조직 로스터가 원천이며 사용 이벤트가 없는 사람도 목록에 남는다.

## 조회

경로 앞: /api/v1/organizations/{organizationId}

| 요청                          | 파라미터 / 결과                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| GET /members/dashboard        | startDate, endDate, timeZone → MembersResponse                                                       |
| GET /members                  | 같은 날짜 + q, memberId, status, sort, order, limit=20, offset=0, snapshotId → MemberListResponse    |
| GET /members/unassigned       | 같은 날짜 + limit=20, offset=0, snapshotId → MemberListResponse                                      |
| GET /seat-reclaim-candidates  | limit=20, cursor, snapshotId → ReclaimCandidatesResponse                                             |
| GET /members/{memberId}/seats | snapshotId(선택) → MemberSeatsResponse — 구성원의 벤더 좌석과 판정(서버 원장)                        |
| GET /vendors/{vendorId}/seats | limit=50(최대 200), cursor, snapshotId → VendorSeatsResponse — 등록 제품 하나의 좌석 전부(설정 권한) |
| GET /teams                    | 현재 배정 가능한 팀 검색. 공통 문서 참조                                                             |

dashboard는 목록·미배정·회수 후보 각각 첫 20개를 포함한다.
q는 최대 200자, 계정/이름 검색이다. 검색은 첫 페이지 클라이언트 배열이 아니라 권한 범위 전체 로스터에 적용한다.
구성원/미배정 목록은 계정 오름차순이 기본이며 동률은 memberId 오름차순이다. 선택한 정렬 값이 null이면 양방향 마지막이다.
회수 후보는 idleDays 내림차순, 동률 seatAssignmentId.
비교 필터는 이 화면에 적용하지 않는다.

```ts
type OffsetPage<T> = {
  items: T[];
  totalCount: number;
  nextOffset: number | null;
};
type Member = {
  memberId: string;
  account: string;
  displayName: string;
  team: TeamRef;
  role: Role;
  status: "active" | "suspended";
  version: number;
  periodUsage: {
    equivalentCostUsd: Value<string>;
    sessionCount: Value<number>;
  } | null;
  lastUsedAt: string | null;
  activity: "active" | "candidate" | "idle" | "unobserved";
  seatState: "assigned" | "unassigned" | "reclaimed" | "unknown";
};
type ReclaimCandidate = {
  seatAssignmentId: string;
  memberId: string;
  account: string;
  team: TeamRef;
  vendorId: string;
  tierId: string | null; // 등급을 모르는 좌석은 null
  version: number;
  lastUsedAt: string | null;
  idleDays: number;
  estimatedMonthlySavingsUsd: Money | null;
  canReclaim: boolean; // 회수 실행이 없어 false
  reason: string | null; // vendor_control_unavailable
  vendorAccount?: string; // 좌석의 벤더 계정(가산). account 는 구성원의 계정
};
type Value<T> = {
  value: T | null;
  status: "complete" | "partial" | "unavailable";
  reasons: string[];
};
type MembersMeta = {
  organizationId: string;
  asOf: string;
  startDate: string;
  endDate: string;
  snapshotId: string;
};
type MemberSummary = {
  rosterMembers: number;
  activeUsers: Value<number>;
  unassignedMembers: number;
  periodUnassignedEquivalentCostUsd: Value<string>;
  periodUnassignedCostShare: Value<number>; // 0~1 비율, 분모가 0이거나 확인 불가이면 null
  reclaimCandidates: Value<number>;
};
type MembersResponse = {
  meta: MembersMeta;
  summary: MemberSummary;
  policy: { idleDays: 7 | 14 | 30 | 60; version: number };
  capabilities: {
    invite: boolean;
    assignTeam: boolean;
    reclaimSeats: boolean;
    restoreSeats: boolean;
  };
  members: OffsetPage<Member>;
  unassigned: OffsetPage<Member>;
  reclaimCandidates: Section<Page<ReclaimCandidate>>;
};
type MemberListResponse = { meta: MembersMeta; members: OffsetPage<Member> };
type ReclaimCandidatesResponse = {
  meta: CurrentMeta;
  idleDays: number;
  candidates: Section<Page<ReclaimCandidate>>;
};
type TeamAssignmentsRequest = {
  assignments: { memberId: string; teamId: string; expectedVersion: number }[];
};
type TeamAssignmentsResponse = {
  effectiveAt: string;
  members: { memberId: string; teamId: string; version: number }[];
};
type InvitationsRequest = {
  invitations: { email: string; teamId: string | null; role: Role }[];
};
type InvitationsResponse = {
  results: {
    email: string;
    invitationId: string | null;
    status: "queued" | "already_member" | "already_invited" | "rejected";
    reason: string | null;
    expiresAt: string | null;
  }[];
};
type ReclaimPreviewRequest = {
  seats: { seatAssignmentId: string; expectedVersion: number }[];
};
type ReclaimPreviewResponse = {
  previewId: string;
  expiresAt: string; // 만든 뒤 5분
  eligibleSeatAssignmentIds: string[];
  rejected: { seatAssignmentId: string; reason: string }[];
  estimatedMonthlySavingsUsd: Money | null; // 대상 좌석 등급의 계약 단가 합(추정). 모르면 null
  savingsEffectiveAt: string | null; // 감액 시점은 모른다 — null
  resultingUnallocatedSeats: number | null;
  savingsBasis?: "contract_unit_price" | null; // 서버 가산
  targets?: {
    seatAssignmentId: string;
    vendorId: string;
    method: "vendor_control" | "admin_action";
  }[]; // 서버 가산
};
type ReclaimRequest = { previewId: string };
type MemberSeatsResponse = {
  meta: { organizationId: string; asOf: string; snapshotId: string };
  memberId: string;
  policy: { idleDays: number; version: number };
  seats: MemberSeat[];
};
type MemberSeat = {
  seatAssignmentId: string;
  version: number;
  vendorId: string;
  vendorName: string;
  kind: string;
  tierId: string | null;
  tierLabel: string | null;
  vendorTier: string | null;
  account: string;
  accountKind: "email" | "github_login";
  state: "assigned" | "pending_assignment" | "pending_release" | "released";
  source: string;
  assignedAt: string;
  releaseEffectiveOn: string | null;
  releasedAt: string | null;
  ledgerAvailability: "available" | "partial" | "unavailable";
  ledgerReason: string | null;
  lastUsedAt: string | null;
  idleDays: number | null;
  reviewReason: string | null;
  reclaimCandidate: boolean;
  canReclaim: boolean;
  reclaimReason: string | null;
  reclaimMethod: "vendor_control" | "admin_action" | null;
  lastControl: {
    operationId: string;
    kind: "seat_reclaim" | "seat_restore";
  } | null; // 가장 최근 회수·복원 작업
};
```

## 숫자의 의미

- rosterMembers는 현재 로스터 수, activeUsers는 선택 기간 실제 사용자의 고유 수다.
- 현재 로스터의 팀과 periodUsage의 이벤트 귀속 팀은 다를 수 있다.
  periodUsage는 그 사람의 선택 기간 전체 사용량이며 팀 분석의 특정 팀 범위와 다를 수 있다.
- unassignedMembers와 unassigned 목록은 **현재 팀 미배정** 구성원이다.
  periodUnassignedEquivalentCostUsd는 **이벤트 당시 미배분** 비용이다. 현재 미배정 명단 비용 합과 같다고 가정하지 않는다.
- contracted/assigned/unallocated는 asOf의 계약·좌석 배정 상태. activeInPeriod는 기간 중 사용한 실제 좌석 수다.
  여러 벤더를 쓰는 한 사람이 여러 좌석을 차지할 수 있다.
- unallocated=contracted-assigned는 같은 계약 범위에서만 계산한다.
  계약 좌석에서 사람 수를 빼서 미사용 좌석으로 표시하지 않는다.
- inactiveAssigned는 현재 배정 좌석 중 선택 기간 사용이 없었고 관측이 충분한 좌석 수다.
  UI의 “미사용 좌석”이 미배정/비활성 중 무엇인지 연동할 때 구분한다.
- lastUsedAt은 asOf까지의 마지막 사용 시각. 회수 자격은 조회 기간이 아닌 현재 asOf에서 판단한다.
- idleDays는 마지막 사용(사용 이력이 없으면 배정 시각)부터 지난 완전한 24시간 수.
  idleDays >= policy.idleDays이고 그 전체 구간의 관측이 충분할 때만 후보로 올린다.
- 신호가 끊긴 설치, 사용 이력도 관측 근거도 없는 사람을 자동 회수 후보로 만들지 않는다.
- 회수는 memberId가 아니라 벤더별 seatAssignmentId 단위다. 한 계정에 여러 좌석이면 UI에서도 벤더를 표시한다.
- 절감액은 실제 계약의 취소/감액 가능 시점과 요금 기준으로 산출한다. 단순 인원×표준 단가를 확정 절감액으로 쓰지 않는다.
- 좌석 회수는 대시보드 role을 viewer로 바꾸지 않는다. 현재 UI의 “조회 전용 전환” 문구는 연동 시 제거/정책 재확인이 필요하다.

## 팀 배정

POST /member-team-assignments → 200 TeamAssignmentsResponse. 최대 100명, Idempotency-Key 필수.
배정 항목은 모두 검증한 뒤 한 트랜잭션으로 적용한다. 한 항목의 버전·권한·teamId가 잘못되면 전체 실패.
effectiveAt은 서버 시각이며 과거 사용 집계를 소급 변경하지 않는다.
IdP가 팀의 원천이면 로컬 override 허용 여부를 확인하고, 변경 금지인 경우 422 directory_managed로 응답한다.

요청 예:

```json
{
  "assignments": [
    {
      "memberId": "member-003",
      "teamId": "team-platform",
      "expectedVersion": 2
    }
  ]
}
```

## 초대

POST /invitations/batch → 200 InvitationsResponse. 최대 100명, Idempotency-Key 필수.
UI 기본 팀/역할과 개별 override를 해석해 **개별 최종 값**을 전송한다.
이메일 형식·중복·기존 가입·권한 상승 가능 여부를 서버에서 검증한다.
기존 조직의 이메일 정규화/IdP 정책을 따른다. 이메일 로컬 부분을 무조건 소문자로 바꾸지 않는다.
조직 관리자가 부여할 수 없는 역할을 요청하면 rejected/role_not_assignable.
queued는 초대 레코드와 발송 작업 접수이며 실제 배달 성공이 아니다.
초대만으로 벤더 유료 좌석을 자동 구매/배정하지 않는다. SSO 자동 가입도 별도의 기존 인증 흐름이다.

요청 예:

```json
{
  "invitations": [
    {
      "email": "collaborator@example.org",
      "teamId": "team-platform",
      "role": "viewer"
    }
  ]
}
```

## 회수 확인 → 실행 → 되돌리기

1. POST /seat-reclaims/preview, 본문 ReclaimPreviewRequest → 200 ReclaimPreviewResponse.
   권한·좌석 상태·관측·정책·계약을 다시 계산한다. preview 유효기간 5분 제안.
2. 확인창은 이 결과의 대상·절감 예상액을 보여 준다. 거절된 대상은 이유를 표시하고 제외한다.
3. POST /seat-reclaims, 본문 ReclaimRequest → 202 OperationResponse + Location.
   preview를 조직/요청자/대상 버전에 묶고 실행 시에도 다시 검증한다.
   만료·변경은 409 preview_expired 또는 preview_stale. 별도 Idempotency-Key 필수.
4. GET /operations/{operationId}로 실제 성공/실패를 확인한다. 벤더 API가 있는 좌석은 서버가 다음 동기화 주기에 해지하고(`pending` → 결과),
   없는 좌석은 `awaiting_admin_action`(조치 `release_in_vendor_console`)이다 — 관리자가 벤더 콘솔에서 해지한 뒤
   POST /operations/{operationId}/targets/{seatAssignmentId}/confirm(본문 없음)로 확인해야 좌석이 해제된다. 하지 않으면 …/cancel(원장 불변).
   조치 대기는 완료가 아니다. 대상별 결과·실패 사유를 그대로 보여 준다.
5. POST /seat-reclaims/{operationId}/restore, 본문 {} → 202 OperationResponse. 회수 뒤 30일 안, 회수에서 성공한 좌석만.
   불가능하면 422 restore_not_available. 벤더 복원 API가 없는 좌석은 다시 관리자 조치(`restore_in_vendor_console`) 확인이다.
   canRestore=false일 때 버튼을 숨긴다.

회수/복원 후 과거 사용 기록, 조직 구성원, 계약 이력은 삭제하지 않는다.
capabilities.reclaimSeats·restoreSeats는 관리 기능이 켜진 서버면 true다 — 벤더 API가 없는 제품도 관리자 조치 확인으로 끝난다.
좌석마다 canReclaim·reclaimReason·reclaimMethod가 실행 가능 여부다. 회수 후보인가와 회수할 수 있는가는 별개다.
새로고침 뒤에는 MemberSeat.lastControl로 그 좌석의 최근 작업을 다시 찾는다.
쓰기 성공 후 구성원/설정/개요 좌석 관련 캐시를 무효화한다.

## 수용 기준

- 사용 이벤트 없는 로스터가 목록·초대·배정에서 사라지지 않는다.
- 검색/더보기는 전체 명단 기준, 첫 페이지만으로 총계나 검색 결과를 계산하지 않는다.
- 여러 벤더 좌석, 팀 이동, IdP 관리 팀, 회수 직전 사용 재개, 수집 장애를 검증한다.
- 중복 클릭/네트워크 재시도로 초대·회수가 중복 실행되지 않는다.
- 동일 구성원 동시 배정은 409, 다른 조직 ID 참조는 차단한다.
- 외부 회수 부분 실패, 복원 불가, 발송 실패를 성공으로 표시하지 않는다.
- 미수집 값은 null, 실제 무사용은 0. 관리 목록은 사용량 수집 여부와 무관하게 동작한다.

응답 예시: [members-response.example.json](members-response.example.json).

## 초대·구성원 사용 예정 제품

초대 폼과 온보딩은 조직의 등록 제품을 선택 사항으로 복수 지정한다. 일괄 기본 선택을 개인별로 바꿀 수 있으며 개인별 빈 배열은 미선택, null·생략은 기본 선택 상속이다.
최종 선택을 각 초대 항목의 `plannedVendorIds?: string[]`로 보낸다. 빈 선택은 생략할 수 있다. 이 값은 벤더 계정 생성이나 실제 좌석 배정을 뜻하지 않는다.
초대 목록·구성원 조회의 `plannedVendorIds`를 구성원 상세에서 복원한다. `PATCH /members/{memberId}`는 변경된 제품 목록과 `expectedVersion`을 보내며 빈 배열은 전체 해제다.
제품은 `settings`의 등록 벤더 목록에서 읽는다. 로딩·조회 실패·등록 제품 없음은 구분한다. 등록 해제된 기존 선택은 유지·제거할 수 있고 새로 선택할 수 없다.
백엔드 enrollment V30·dashboard cache V6 마이그레이션과 API 변경을 먼저 배포한다. 프론트의 선택은 실제 좌석 집계에 사용하지 않는다.

## 화면 응답과 상태

명단·팀·좌석은 snapshot의 현재 기준 시각에 고정한다. 사용량은 프론트가 요청하는 최근 7일이며 비교는 사용하지 않는다. 사용량이 없어도 명단과 관리 기능을 숨기지 않는다. 첫 페이지 이후에는 같은 기간·조직·snapshot의 페이지를 끝까지 확인해 검색과 CSV를 만든다.

본문 응답에서 헤더의 수집 현황, 중복 asOf, 비교·가격 버전 메타, 구성원별 토큰 상세·활성 사용자 수, 사용하지 않는 좌석 집계를 제거했다. 비용 비중은 서버가 같은 snapshot의 미배분 비용과 전체 비용으로 계산한다. 현재 팀 미배정 인원과 이벤트 당시 미배분 비용은 다른 범위다.

`Value`는 개요와 같은 의미이며 0과 확인 불가를 구분한다. 미완료 기간·식별 누락·가격 누락 사유를 보존하고, 회수 후보 수는 후보 목록의 판정 가용성과 같은 사유를 갖는다. 관측이 부족한 좌석을 후보 0으로 확정하지 않는다. 본문 조회 실패는 HTTP 오류이고 초대·팀 목록·좌석 상세의 독립 조회와 쓰기 경로는 유지한다.

CSV는 명단에 보이는 비용·세션·마지막 사용에 비용/세션 상태와 사유를 함께 내보낸다. 미확정 값은 빈 칸이다. 기존 응답과 호환되지 않으므로 프론트와 백엔드를 함께 적용한다.

## 구성원 서버 페이지네이션

`members`·`unassigned`는 `{items,totalCount,nextOffset}`이다. 첫 화면은 구성원 20명만 받고 더보기에서 다음 offset을 요청한다.
후속 페이지는 동일 snapshotId를 유지한다. 정렬·검색·상태 변경 시 offset=0부터 읽고 snapshot 만료 시 새 snapshot으로 다시 시작한다.
`sort=account|team|cost|activity`(기본 account), `order=asc|desc`(기본 asc)이며 activity 정렬 값은 lastUsedAt이다.
동률은 memberId 오름차순이고 null은 양방향 마지막이다. `q`는 계정·표시 이름·현재 팀 이름을 검색한다.
`status=all|active|candidate|idle|unobserved`는 응답 activity를 기준으로 필터링한다(계정 상태 status와 구별).
`memberId` UUID로 첫 페이지 밖의 구성원을 정확히 조회할 수 있다. CSV 버튼을 누를 때만 전체 구성원 페이지를 읽는다.
