# 구성원 API — v1 제안

[공통 계약](README.md)과 [개요의 기간·단위 규칙](overview-api.md)을 따른다.
현 화면: MembersContent, MemberListCard, UnassignedCard, SeatReclaimCard, InviteModal.
실제 조직 로스터가 원천이며 사용 이벤트가 없는 사람도 목록에 남는다.

## 조회

경로 앞: /api/v1/organizations/{organizationId}

| 요청 | 파라미터 / 결과 |
| --- | --- |
| GET /members/dashboard | startDate, endDate, timeZone → MembersResponse |
| GET /members | 같은 날짜 + q, limit=20, cursor, snapshotId → MemberListResponse |
| GET /members/unassigned | 같은 날짜 + limit=20, cursor, snapshotId → MemberListResponse |
| GET /seat-reclaim-candidates | limit=20, cursor, snapshotId → ReclaimCandidatesResponse |
| GET /teams | 현재 배정 가능한 팀 검색. 공통 문서 참조 |

dashboard는 목록·미배정·회수 후보 각각 첫 20개를 포함한다.
q는 최대 200자, 계정/이름 검색이다. 검색은 첫 페이지 클라이언트 배열이 아니라 권한 범위 전체 로스터에 적용한다.
구성원/미배정 목록은 선택 기간 비용 내림차순, 동률 memberId. 미수집 사용자는 null로 마지막.
회수 후보는 idleDays 내림차순, 동률 seatAssignmentId.
비교 필터는 이 화면에 적용하지 않는다.

```ts
type Member = {
  memberId: string;
  account: string;
  displayName: string;
  team: TeamRef;
  role: Role;
  status: "active" | "suspended";
  version: number;
  periodUsage: Usage | null;
  lastUsedAt: string | null;
  observation: Observation;
  seatState: "assigned" | "unassigned" | "reclaimed" | "unknown";
};
type ReclaimCandidate = {
  seatAssignmentId: string;
  memberId: string;
  account: string;
  team: TeamRef;
  vendorId: string;
  tierId: string;
  version: number;
  lastUsedAt: string | null;
  idleDays: number;
  estimatedMonthlySavingsUsd: Money | null;
  canReclaim: boolean;
  reason: string | null;
};
type MemberSummary = {
  rosterMembers: number;
  activeUsers: number | null;
  unassignedMembers: number;
  periodUnassignedEquivalentCostUsd: Money | null;
  periodTotalEquivalentCostUsd: Money | null;
  seats: Section<{
    contracted: number;
    assigned: number;
    unallocated: number;
    activeInPeriod: number | null;
    inactiveAssigned: number | null;
    reclaimCandidates: number | null;
    estimatedMonthlySavingsUsd: Money | null;
  }>;
};
type MembersResponse = {
  meta: AnalyticsMeta;
  asOf: string;
  ingest: OverviewResponse["ingest"];
  summary: MemberSummary;
  policy: { idleDays: 7 | 14 | 30 | 60; version: number };
  capabilities: { invite: boolean; assignTeam: boolean; reclaimSeats: boolean; restoreSeats: boolean };
  members: Page<Member>;
  unassigned: Page<Member>;
  reclaimCandidates: Section<Page<ReclaimCandidate>>;
};
type MemberListResponse = { meta: AnalyticsMeta; members: Page<Member> };
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
  expiresAt: string;
  eligibleSeatAssignmentIds: string[];
  rejected: { seatAssignmentId: string; reason: string }[];
  estimatedMonthlySavingsUsd: Money | null;
  savingsEffectiveAt: string | null;
  resultingUnallocatedSeats: number | null;
};
type ReclaimRequest = { previewId: string };
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
{"assignments":[{"memberId":"member-003","teamId":"team-platform","expectedVersion":2}]}
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
{"invitations":[{"email":"collaborator@example.org","teamId":"team-platform","role":"viewer"}]}
```

## 회수 확인 → 실행 → 되돌리기

1. POST /seat-reclaims/preview, 본문 ReclaimPreviewRequest → 200 ReclaimPreviewResponse.
   권한·좌석 상태·관측·정책·계약을 다시 계산한다. preview 유효기간 5분 제안.
2. 확인창은 이 결과의 대상·절감 예상액을 보여 준다. 거절된 대상은 이유를 표시하고 제외한다.
3. POST /seat-reclaims, 본문 ReclaimRequest → 202 OperationResponse + Location.
   preview를 조직/요청자/대상 버전에 묶고 실행 시에도 다시 검증한다.
   만료·변경은 409 preview_expired 또는 preview_stale. 별도 Idempotency-Key 필수.
4. GET /operations/{operationId}로 실제 성공/실패를 확인한다.
5. POST /seat-reclaims/{operationId}/restore, 본문 {} → 202 OperationResponse.
   복원 가능 기간, 빈 좌석·권한·벤더 복원 기능을 검사한다. 불가능하면 422 restore_not_available.
   복원도 실제 외부 처리 결과를 확인하며 canRestore=false일 때 버튼을 숨긴다.

회수/복원 후 과거 사용 기록, 조직 구성원, 계약 이력은 삭제하지 않는다.
벤더 회수 기능이 없으면 capabilities.reclaimSeats=false와 reason=vendor_control_unavailable.
관측 기반 후보 조회 자체가 가능하더라도 실행 가능 여부는 별개다.
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
