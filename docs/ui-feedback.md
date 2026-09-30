# 조회·요청 상태 UI 규칙

페이지와 폼에서 로딩, 오류, 빈 상태, 처리 결과를 일관되게 표시하기 위한 기준이다.
새로 구현하거나 수정하는 화면에 적용한다. 현재 적용 범위는 아래에 별도로 기록한다.

## 역할 분담

- TanStack Query: 서버 데이터, 조회·변경 요청의 진행 상태, 오류, 캐시, 재시도 관리.
- React 상태: 선택한 항목, 드로어 열림 여부, 입력 중인 값 등 화면 상태 관리.
- 공통 UI 컴포넌트: 로딩·오류·빈 상태·Toast의 모양과 접근성 처리.
- 페이지·폼: 요청이 영향을 주는 범위와 적절한 표시 위치 결정.

같은 요청의 로딩·오류를 별도 `useState`로 중복 관리하지 않는다.
모든 요청을 하나의 페이지 로딩으로 합치지 않고, 같은 응답에 의존하는 영역을 함께 처리한다.

## 페이지 너비

개요·설정의 본문과 로딩·오류·빈 상태는 [PageContainer](../src/components/layout/PageContainer.tsx)를 사용한다.
최대 너비는 개요 기준 `1440px`, 좌우 내부 여백은 `24px`이며 가운데 정렬한다.
작은 화면에서는 가용 너비에 맞춰 줄어든다. 공통 헤더·툴바와 드로어의 너비는 별도로 유지한다.

## 표시 기준

| 상황 | 표시 범위와 동작 |
| --- | --- |
| 최초 페이지 조회 | 해당 응답에 의존하는 본문 전체를 로딩으로 대체한다. 사이드바·헤더 등 공통 틀은 유지한다. |
| 최초 조회 실패 | 해당 본문에 오류 안내와 재시도 버튼을 표시한다. 빈 상태나 정상 지표로 대체하지 않는다. |
| 새로고침 | 기존 데이터를 유지하고 작은 진행 표시를 제공한다. 열려 있는 드로어나 입력값을 초기화하지 않는다. |
| 새로고침 실패 | 기존 데이터를 유지하면서 갱신 실패와 재시도 방법을 알린다. 최신 조회가 성공한 것처럼 표시하지 않는다. |
| 상세 조회 | 클릭한 행 또는 상세 영역에만 진행 상태를 표시한다. 무관한 본문은 유지한다. |
| 상세 조회 실패 | 어떤 항목의 조회가 실패했는지 알 수 있는 위치에 오류와 상세 재시도를 제공한다. |
| 저장·삭제 요청 중 | 실행 버튼에 “저장 중…”·“삭제 중…” 등 진행 상태를 표시하고 중복 실행을 막는다. 관련 입력과 충돌하는 동작을 잠근다. |
| 처리 성공 | 서버가 성공을 확정한 뒤 Toast를 표시하고 관련 쿼리를 갱신한다. 완료 후 닫는 폼은 드로어·모달을 닫는다. |
| 입력 오류 | 해당 입력 근처에 오류를 표시한다. 사용자가 입력한 값은 유지한다. |
| 저장 실패·동시 수정 충돌 | 폼 안에 오류와 복구 방법을 유지한다. Toast만 띄운 뒤 사라지게 하지 않는다. |
| 정상 조회 결과가 비어 있음 | 해당 영역에 빈 상태를 표시한다. 가능하면 추가·검색 초기화 등 다음 행동을 제공한다. |
| 응답 값이 `null` | 값 자리에 `-`를 표시한다. 로딩이나 실제 값 `0`과 구분한다. |

인증·권한이 거부된 경우에는 기존 데이터 유지 규칙보다 접근 제한을 우선한다.
권한 없는 데이터는 숨기고 로그인 또는 권한 안내를 표시한다.

설정의 지표 카드·벤더 목록·수집 정책·알림 규칙은 같은 설정 응답을 사용하므로
최초 로딩과 조회 실패도 함께 처리한다. 별도 상세 요청은 페이지 전체를 가리지 않는다.
독립된 API를 사용하는 영역은 한 요청이 실패해도 다른 정상 영역을 유지할 수 있다.

## TanStack Query 상태 사용

- 활성화된 조회에 데이터가 없고 `isPending`이면 최초 조회 상태로 처리한다.
- `data`가 있고 `isFetching`이면 기존 내용을 유지하며 재조회 중임을 표시한다.
- `isError`이면 사용 가능한 기존 데이터 유무에 따라 최초 실패와 갱신 실패를 구분한다.
- 변경 요청은 `useMutation`의 `isPending`으로 진행 표시와 중복 실행 방지를 연결한다.
- 수동 새로고침·조회 재시도는 `refetch({ cancelRefetch: false })`를 사용한다. 같은 쿼리의 요청이 진행 중이면 취소·재시작하지 않고 그 결과를 기다린다.
- 저장·삭제 후 `invalidateQueries`에는 위 옵션을 일괄 적용하지 않는다. 변경 전에 시작한 요청이 있다면 변경 후 데이터를 다시 조회해야 하기 때문이다.
- `enabled: false`인 쿼리도 `isPending`일 수 있다. 선택하지 않은 상세 항목까지 로딩으로 표시하지 않는다.
- 네트워크 문제로 요청이 일시 정지된 상태는 실제 진행 중인 요청과 구분한다. `fetchStatus`를 확인해 연결 대기 상태를 안내한다.

편집 중 서버 재조회로 입력값을 덮어쓰지 않는다. 최신 내용으로 입력을 초기화해야 한다면
사용자의 명시적인 다시 불러오기 동작으로 처리한다.
항목을 전환할 때는 쿼리 키에 조직·항목 ID를 포함하고 요청에 `AbortSignal`을 전달해
이전 응답이 새 선택을 덮어쓰지 않게 한다.

## 성공 Toast

- 화면 하단의 일관된 위치에 표시하며 본문 레이아웃을 밀지 않는다.
- 기본 표시 시간은 4초로 하고, 닫기 버튼을 제공한다.
- 포인터를 올리거나 키보드 초점이 Toast 안에 있으면 자동 닫힘을 잠시 멈춘다.
- 성공 알림은 `role="status"` 등 정중한 라이브 알림으로 전달하고 초점을 강제로 옮기지 않는다.
- 닫기 버튼에는 접근 가능한 이름을 제공한다. 움직임 효과는 모션 감소 설정을 따른다.
- 동일한 작업의 성공 메시지를 본문과 Toast에 중복 표시하지 않는다.
- 연속 알림은 가장 최근 메시지 하나를 표시한다. 같은 문구가 다시 와도 표시 시간을 새로 시작한다.
- 사용자가 실행한 작업 완료에 사용한다. 자동 재조회 성공마다 Toast를 띄우지 않는다.
- 저장 성공 후 목록 갱신만 실패했다면 저장 실패로 안내하지 않는다. 저장 결과와 갱신 실패를 구분한다.

문구 예시: “변경사항을 저장했습니다”, “계약 정보를 비웠습니다”, “벤더를 삭제했습니다”.
사용자가 반드시 읽어야 하는 정책 설명이나 복구 동작은 사라지는 Toast에만 담지 않는다.

## 컴포넌트와 Storybook

공통 표현은 `src/components/ui/`에 두고, 화면은 필요한 상태를 조합한다.
공통 컴포넌트에 특정 API 호출이나 페이지별 권한 판단을 넣지 않는다.
규칙을 바꿀 때는 문서·관련 컴포넌트·Storybook 사례를 함께 갱신한다.

공통 성공 알림은 [Toast.tsx](../src/components/ui/Toast.tsx)의 `Toast`와 `useToast`를 사용한다.
화면에서 `useToast()`를 호출하고 `Toast`를 한 번 렌더링한 뒤, 사용자 작업의 성공 콜백에서
`showToast(message)`를 호출한다. API·캐시 처리는 호출하는 화면에 둔다.
[Toast 스토리](../src/components/ui/Toast.stories.tsx)와 [성공 알림 예시](http://localhost:6006/?path=/story/ui-toast--success)에서 확인한다.

공통 상태 컴포넌트:

- [LoadingState](../src/components/ui/LoadingState.tsx): 본문·영역의 `panel` 로딩과 새로고침의 `inline` 표시. 높이와 외부 여백은 사용하는 화면에서 정한다.
- [ErrorState](../src/components/ui/ErrorState.tsx): 오류 메시지와 선택적인 재시도 버튼. `retrying`이면 버튼을 잠근다. 충돌 복구 같은 별도 동작은 `children`으로 조합한다.
- [EmptyState](../src/components/ui/EmptyState.tsx): 빈 결과의 메시지·설명·선택적인 다음 행동.
- [Button](../src/components/ui/Button.tsx): `loading`과 `loadingLabel`로 진행 표시·버튼 잠금·`aria-busy`를 함께 처리한다.
- [공통 상태 스토리](../src/components/ui/Feedback.stories.tsx): [UI / Feedback](http://localhost:6006/?path=/story/ui-feedback--page-loading).

공통 컴포넌트는 쿼리를 직접 받지 않는다. 페이지에서 데이터 유무·권한·요청 상태에 따라
필요한 표현을 선택하며, 로딩만을 위한 별도 서버 상태나 페이지별 복제 컴포넌트를 만들지 않는다.

현재 설정 구현:

- [SettingsContent](../src/components/settings/SettingsContent.tsx): 본문 조회 상태, 새로고침, 벤더 상세 조회.
- [VendorTable](../src/components/settings/VendorTable.tsx): 선택한 행의 상세 조회 진행 표시.
- [ServerVendorDrawer](../src/components/settings/ServerVendorDrawer.tsx): 변경 요청, 입력 보존, 충돌 복구.
- [설정 스토리](../src/components/settings/SettingsContent.stories.tsx): 상태별 상호작용 검증.

`npm run storybook` 실행 후 확인할 사례:

| 사례 | Storybook |
| --- | --- |
| 최초 로딩 | [Loading](http://localhost:6006/?path=/story/pages-settings--loading) |
| 로딩 완료 후 실제 빈 값 표시 | [LoadingThenLoaded](http://localhost:6006/?path=/story/pages-settings--loading-then-loaded) |
| 기존 화면을 유지하는 새로고침 | [Refreshing](http://localhost:6006/?path=/story/pages-settings--refreshing) |
| 최초 조회 실패 | [LoadError](http://localhost:6006/?path=/story/pages-settings--load-error) |
| 벤더 상세 로딩·선택 전환 | [VendorLoading](http://localhost:6006/?path=/story/pages-settings--vendor-loading) |
| 상세 조회 실패 후 재시도 | [VendorLoadError](http://localhost:6006/?path=/story/pages-settings--vendor-load-error) |
| 등록 제품 없음 | [Empty](http://localhost:6006/?path=/story/pages-settings--empty) |
| 저장 실패 시 입력 보존 | [SaveError](http://localhost:6006/?path=/story/pages-settings--save-error) |
| 동시 수정 충돌 | [Conflict](http://localhost:6006/?path=/story/pages-settings--conflict) |
| 계약 정정·비우기·삭제·재등록 | [ContractLifecycle](http://localhost:6006/?path=/story/pages-settings--contract-lifecycle) |

## 적용 현황

설정의 최초 본문 로딩, 기존 데이터를 유지하는 재조회, 벤더 상세 조회는 구현되어 있다.
저장 오류와 충돌 안내도 드로어 안에서 처리한다. 위 Storybook은 목 API로 동작하며,
실제 서버 연동 검증은 별도 E2E 테스트에서 수행한다.

공통 성공 Toast를 구현하고 설정의 벤더 추가·저장·계약 비우기·삭제와 수집 정책 저장에 적용했다.
공통 로딩·오류·빈 상태 컴포넌트를 설정 본문·미적용 설치 목록과 개요 본문에 적용했다.
설정 드로어의 오류 표시, 저장·삭제 버튼과 수동 새로고침 버튼도 공통 표현을 사용한다.
개요의 관측 안내처럼 도메인 설명이 필요한 빈 상태는 기존 전용 컴포넌트를 유지한다.
구성원 화면은 명단·요약·미배정을 한 snapshot의 조회로 묶어 본문 로딩·오류·재조회를 함께 처리하고,
초대 대기와 팀 목록은 독립 조회라 한쪽이 실패해도 명단을 유지한다. 필터·정렬·검색·CSV는 전체 페이지를 받은 명단에 적용한다.
구성원 화면의 저장(팀·역할 편집, 팀 배정, 팀 관리, 초대 코드)은 서버가 확정하고 관련 조회를 다시 읽은 뒤에 화면을 바꾼다.
편집기는 열었을 때의 version으로 저장하고, 충돌하면 입력을 남긴 채 잠그고 “최신 내용 불러오기”를 눌렀을 때만 최신 값으로 바꾼다.
팀·역할 저장, 팀 배정, 초대 취소는 Toast로 알린다. 발급·재발급한 초대 코드는 다시 조회할 수 없는 값이라 Toast가 아닌
그 자리(초대 창·대기 행)에 남기고, 초대 창을 닫거나 행에서 숨기면 화면에서 지운다. 팀 관리는 드로어 안의 안내로 결과를 알린다.
도입 문의 폼은 입력 확인과 접수를 나눈다. 확인 단계에서는 요청을 보내지 않고, 접수 버튼은 요청 중에 잠그며,
접수 번호와 시각은 사라지지 않게 그 자리에 남긴다(Toast를 쓰지 않는다). 실패하면 입력을 남긴 채 사유(입력 오류·요청 한도의 대기 시간·연결 실패)를 폼 안에 보여 준다.
갱신 실패 문구, 네트워크 연결 대기 표시와 다른 페이지의 적용 여부는 추가 점검이 필요하다.
이 문서를 추가한 것만으로 모든 화면이 기준을 충족한 것으로 보지 않는다.

## 공통 헤더의 조직 수집 현황

`DashboardHeaderProvider`는 대시보드 레이아웃에서 한 번만 렌더링한다. 기간 필터와
자동 갱신 설정도 같은 레이아웃의 `FiltersProvider`를 사용하며 페이지별로 중첩하지 않는다.
페이지는 `useDashboardPageRefresh`로 자신의 재조회 동작·진행 여부만 등록한다.
수동 새로고침은 현재 페이지와 조직 수집 현황을 함께 조회하고, 자동 갱신은 공통 설정을 따른다.

`IngestStatusBar`의 높이는 모든 상태에서 40px로 유지한다. 조직 ID만 포함한 쿼리 키로
`GET /api/v1/organizations/{organizationId}/ingest-status`를 조회하므로 기간 변경과 독립적이다.
최초 조회는 inline LoadingState, 오류는 inline ErrorState, 재조회는 기존 값과 작은 진행 표시를 쓴다.
권한 거부 시 이전 값은 숨기고 조직이 바뀌면 다른 조직의 캐시를 표시하지 않는다.
현재 서버 판정은 empty/unknown이며 lastReceivedAt만으로 정상·지연·중단을 추정하지 않는다.
마지막 수신 시각은 한국 시간의 절대 시각으로 표시해 자동 갱신을 꺼도 상대 시간이 낡지 않게 한다.
개요의 선택 기간별 관측 일수는 헤더가 아닌 개요 본문에서 표시한다.

[공통 헤더 스토리](../src/components/layout/DashboardHeader.stories.tsx)에서 로딩·오류·재시도·재조회·본문 전환을 검증한다.
서버 변경은 [backend-ingest-status.patch](../patches/backend-ingest-status.patch)에 준비되어 있다.
이 대화에서는 백엔드 디렉터리에 쓰기 권한이 없어 실제 적용·서버 테스트는 하지 않았다.
서버 패치 적용 전에는 실서비스 연결 시 수집 현황 줄이 API 오류를 표시할 수 있다. 목 응답으로 대체하지 않는다.

백엔드 저장소에서 패치 적용 확인과 적용 후 테스트:

```powershell
git apply --check ../pulsemetry-frontend/patches/backend-ingest-status.patch
git apply ../pulsemetry-frontend/patches/backend-ingest-status.patch
./gradlew.bat :apps:dashboard-api:test --tests '*IngestStatusApiTest'
```
