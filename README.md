# Pulsemetry frontend

AI 개발 도구 사용량을 살펴보는 Next.js 관리자 콘솔입니다.

## 실행

Node.js와 npm을 설치한 뒤 실행합니다. 의존성 버전은 package-lock.json을 따릅니다.

```sh
npm ci
npm run dev
```

http://localhost:3000 에서 확인할 수 있습니다.

로컬 API 포트는 **Enrollment 8080 / Dashboard 8081**를 사용합니다.
백엔드도 이 포트로 실행하고 루트 `.env.local`에 아래 주소를 설정합니다.

```dotenv
NEXT_PUBLIC_ENROLLMENT_API_URL=http://localhost:8080
NEXT_PUBLIC_DASHBOARD_API_URL=http://localhost:8081
ENROLLMENT_API_URL=http://localhost:8080
```

브라우저용 Enrollment 주소와 Next 서버용 주소는 같은 백엔드를 가리킵니다.
로컬 시드 로그인에는 `.env.example`의 `DEV_SEED_AUTH_ENABLED`와 `DEV_SEED_AUTH_PASSWORD`도 설정합니다.
주소를 바꾼 후 개발 서버는 재시작하고, 배포 빌드는 다시 생성해야 합니다.


## 화면과 현재 상태

| 화면 | 경로 | 범위 |
| --- | --- | --- |
| 개요 | /overview | 기간별 KPI, 추이, 모델 구성, 상위 3팀과 미배분 요약 |
| 팀 분석 | /teams | 팀 비교, 모델 분석, 사용자 사용량, 팀 상세 드로어 |
| 구성원 | /members | 명단·검색, 초대, 팀 배정, 좌석 회수 UI |
| 설정 | /settings | 벤더 계약, 수집·보존 정책, 알림 규칙 UI |
| 로그인 | /login | 시드 이메일로 실제 백엔드 인증하는 로컬 SSO 시뮬레이션 |
| 온보딩 | /onboarding | 수집 정책, 서버 벤더·플랜 카탈로그, 계약과 팀 등록 |
| 초대 수락 | /invite | 초대 메일의 링크가 가리키는 화면. 링크의 코드(`#code=…`)로 계정을 만든다 |
| 도입 문의 | /contact | 로그인 전 문의 폼. 입력 확인 뒤 서버에 접수하고 접수 번호·시각을 표시 |
| 운영·보안 | /ops | 이번 구현 범위에서 제외된 안내 화면 |

로그인·개요·온보딩·설정·구성원은 실제 백엔드 API를 사용합니다. 구성원 화면은 명단·요약·미배정·초대 대기·팀 목록을
조회하고, 팀·역할 편집, 미배정 구성원의 팀 배정, 팀 만들기·이름 변경·삭제, 초대 코드 발급·재발급·취소를 서버 명령으로 저장합니다.
초대는 **코드 발급**이고 메일 발송은 서버가 따로 합니다. 화면은 서버가 준 발송 상태(`delivery`)로만 말합니다 — 발급 직후는 "발송 대기"이고,
"발송됨"은 서버가 그렇게 답했을 때만 씁니다. 메일을 보내지 않는 서버에서는 코드를 직접 전달하라고 안내합니다. 발급된 코드는 발급 직후 화면에서만 볼 수 있습니다.
"다시 보내기"는 기존 코드를 폐기하고 새 코드를 발급하는 일이라 먼저 확인받습니다. 온보딩의 초대 폼도 같은 명령을 씁니다.
도입 문의는 세션 없이 `POST /v1/inquiries`로 접수합니다. 서버가 201을 준 뒤에만 접수 완료를 보여 주며, 접수는 조직·계정을 만들지 않습니다.
초대 수락 화면은 코드를 주소의 fragment에서 읽고 곧바로 주소에서 지웁니다. 가입 뒤의 로그인은 아직 시드 계정 전용 화면입니다.
팀 분석 화면에는 아직 목 데이터와 로컬 상태가 남아 있습니다. 벤더 좌석 회수는 연결하지 않았습니다.

백엔드 담당자에게는 [화면별 API 구현 요청서](docs/api/README.md)를 전달하면 됩니다.
공통 날짜·금액·권한·페이지네이션 규칙과 화면별 요청/응답 타입, JSON 예시,
저장·초대·회수의 처리 기준이 들어 있습니다.

## 공통 UI 규칙

조회·저장 상태 UI를 구현할 때는 [조회·요청 상태 UI 규칙](docs/ui-feedback.md)을 따른다.
로딩·오류·빈 상태·성공 Toast의 표시 범위와 현재 적용 현황, Storybook 사례를 정리한다.

## 개발 도구

### TanStack Query Devtools

`npm run dev`로 실행하면 화면 하단의 TanStack Query 버튼에서 쿼리 키, 캐시,
조회 상태를 확인할 수 있습니다. 루트 QueryProvider에 연결되어 있으며 프로덕션에서는 표시하지 않습니다.

### Storybook

백엔드 없이 공통 UI 컴포넌트를 개별 확인합니다.

```sh
npm run storybook
# http://localhost:6006

npm run build-storybook
# storybook-static/에 정적 빌드 생성
```

상단 테마 메뉴에서 라이트·다크를 바꾸고 Controls에서 props를 조절할 수 있습니다.
버튼, 지표 카드(0과 미확정 값 포함), 상세 드로어(열기·닫기와 긴 내용) 스토리를 제공합니다.
온보딩은 `Pages / Onboarding`에서 수집 정책, 벤더·플랜 등록, 팀 구성, 로딩, 조회 실패, 등록 실패를 확인합니다.
바로 열기: http://localhost:6006/?path=/story/pages-onboarding--collection
MSW가 Storybook 전용 API 응답을 제공하므로 백엔드 실행이나 시드 로그인 환경변수가 필요하지 않습니다.
등록·삭제 결과는 스토리 안에서만 유지되며, 스토리를 다시 실행하면 초기화됩니다.
완료·로그아웃의 페이지 이동은 Storybook Actions에서 확인합니다.
새 스토리는 컴포넌트 옆에 `*.stories.tsx`로 추가합니다. 설정은 `.storybook/`에 있습니다.
`npm run lint`에는 Storybook 권장 규칙도 적용됩니다.

실제 백엔드 연동 검증은 기존 Playwright E2E로 실행합니다. 기존 목 API 테스트의 Storybook 이관은 포함하지 않습니다.

## 검증

```sh
npm run lint
npx tsc --noEmit
npm test
npm run build
node scripts/check-api-docs.mjs
```

브라우저 테스트는 Playwright Chromium이 필요합니다. 최초 환경에서는
`npx playwright install chromium`으로 설치합니다.
API 문서 검사는 문서의 TypeScript 타입과 JSON 예시를 비교하고 링크·집계 합계를 확인합니다.

## 실제 백엔드 E2E

기본 Playwright 설정은 `tests/e2e`의 실제 서버 테스트만 실행합니다.
`--config=playwright.seed.config.ts`는 더 이상 필요하지 않습니다.

1. 백엔드의 `tools/dev-seed/README.md`에 따라 PostgreSQL·ClickHouse와 최신 enrollment/dashboard 서버를 실행합니다. 기존 시드 A/B/C를 그대로 사용하며 테스트가 초기화하지 않습니다.
2. `.env.example`을 참고해 `.env.local`에 실제 서버 주소와 `DEV_SEED_AUTH_ENABLED=true`, 개발용 `DEV_SEED_AUTH_PASSWORD`를 설정합니다. `ENROLLMENT_API_URL`과 `NEXT_PUBLIC_ENROLLMENT_API_URL`은 같은 서버를 가리켜야 합니다. 테스트는 로컬 서버만 허용합니다.
3. `E2E_SEED_DATE`에 **DB 시드를 생성한 기준일**을 설정합니다. 예를 들어 2026-09-28 기준 시드라면 `E2E_SEED_DATE=2026-09-28`입니다. 오늘 날짜로 자동 변경하지 않습니다.
   `E2E_SEED_A_PERIOD_COST_USD`에는 백엔드에서 `docker compose run --rm --no-deps dev-seed plan <기준일>`을 실행해 나온 A의 `period_known_estimated_usd` 값을 설정합니다. 기준일마다 값이 다르며 조회 API의 응답을 옮겨 적지 않습니다.
4. Chromium 설치 후 아래 명령을 실행합니다. 프론트엔드 3000번 서버는 자동 실행하며, 이미 실행 중이면 재사용합니다. 환경 변수를 변경했다면 기존 개발 서버를 재시작하세요.
   다른 포트의 로컬 서버를 대상으로 하려면 `E2E_BASE_URL=http://localhost:<포트>`를 지정합니다. 생략하면 3000번입니다. 백엔드의 허용 origin에도 같은 주소가 있어야 합니다.

```sh
# 테스트 목록에서 시나리오를 고르고 실행
npm run test:e2e:ui

# 크롬 창을 띄워 시나리오 순서대로 실행
npm run test:e2e:headed

# 화면 없이 전체 실행
npm run test:e2e

# 도메인 데이터 조회 시나리오만 실행 (로그인·로그아웃 세션은 생성/폐기)
npm run test:e2e -- --grep @read
```

현재 검증 범위:

- A/B/C 이메일 로그인, 조직별 조회와 새로고침, 로그아웃, 조직 전환, 401 이후 실제 토큰 갱신.
- 달력에서 시드 기간 선택, A의 관측 인원 8명과 시드 plan의 환산 비용 검증, 비교 변경, C의 비용 미확정 값을 `-`로 표시.
- 벤더 생성·멱등 재시도·계약 저장·삭제는 실제 API를 호출하는 **보조 검증**입니다. 브라우저 폼으로 온보딩을 완료하는 테스트는 아닙니다. A에 고유 이름의 벤더를 만들고 `finally`에서 해당 벤더만 삭제하며, 온보딩 상태가 이전과 같은지 확인합니다. 서버의 삭제·감사 이력은 남을 수 있습니다.
- 구성원 조회: A의 명단 12명·미배정 1명·초대 대기와 만료, 검색, 전체 명단 CSV, cursor 페이지가 같은 snapshot인지 확인합니다.
- 구성원 저장(`@write`): 역할 변경이 새로고침 뒤에도 남는지, 미배정 구성원의 팀 배정, 다른 탭이 먼저 바꾼 뒤의 409와 최신 값 다시 읽기, 소유자·자기 역할 규칙,
  팀 만들기·이름 변경·삭제, 초대 코드 발급·대기자 편집·재발급·취소·다시 초대를 실제 화면으로 검증합니다.
  시드 구성원에게 한 변경은 같은 테스트에서 되돌리고, 새로 만드는 것은 `E2E 팀 …` 이름의 팀과 `e2e-…@example.test` 초대뿐이며 `finally`에서 삭제·취소합니다.
  취소된 초대의 대기자 행과 소속 변경 이력은 서버에 남습니다. 초대 코드 값은 실패 메시지에 싣지 않고, 실패 스크린샷을 찍기 전에 화면에서 지웁니다.
- 초대 메일(`@write`): 초대 → 서버의 발송 작업이 보낸 메일이 **메일 수신 컨테이너에 도착**하는지 조회 API로 확인 → 목록이 "발송됨"으로 바뀜 → 다시 보내기 → 두 번째 메일 도착,
  첫 메일의 수락 링크를 열면 코드가 채워지고 폐기된 코드라 가입이 거절되는지 확인합니다. `E2E_MAIL_API_URL`에 수신 컨테이너의 조회 API 주소(백엔드 Compose의 `http://127.0.0.1:8025`)를 설정합니다.
  밖으로 나가는 메일은 없습니다. 테스트가 만든 `e2e-mail-…@example.test` 초대는 `finally`에서 취소하고, 받은 메일은 수신 컨테이너에 남습니다. 실제 가입은 시드 명단을 바꾸므로 하지 않습니다(성공 경로는 목 브라우저 테스트).
- 도입 문의(`@write`): 로그인 없이 `/contact`에서 접수하고, 같은 회사·이메일을 다시 보내면 같은 접수 번호를 받는지 확인합니다.
  실행마다 `E2E 문의 …` 회사와 `e2e-inquiry-…@example.test` 주소의 문의 행 둘이 서버에 남습니다. 서버의 출처별 요청 한도보다 적게(세 번) 보냅니다.

수집 정책 변경·온보딩 완료·시드 초기화는 실행하지 않습니다. 정상 API 응답을 가로채지 않으며, 서버가 없거나 구버전이면 선행 조건 오류로 실패합니다. 실패 스크린샷은 `.e2e-artifacts/backend`에 저장합니다. 실제 인증 토큰이 포함될 수 있는 네트워크 trace는 기본적으로 저장하지 않습니다.

기존 목 API 브라우저 테스트는 `tests/browser`에 유지하며 별도 설정으로 실행합니다.
가로채지 않은 요청이 닿을 백엔드 주소는 `MOCK_ENROLLMENT_API_URL`·`MOCK_DASHBOARD_API_URL`로 바꿀 수 있습니다(기본 8080·8081).
목 테스트는 지정된 환경 변수로 빌드한 전용 서버(3107번)를 사용합니다. 3000번 개발 서버를 재사용하지 않으며, 동시 실행은 2개 worker로 제한합니다. 3107번 서버가 이미 실행 중이면 충돌로 실패하므로 같은 목 테스트 명령을 동시에 실행하지 마세요.

```sh
npm run test:browser:mock -- --ui
# 개요 목 테스트의 독립 빌드/서버 실행
npx playwright test --config=playwright.overview.config.ts
```

## 구조

- src/app: App Router 페이지와 레이아웃
- src/components: 공통 UI, 차트, 화면별 컴포넌트
- src/lib/metrics: 기간·팀·사용량 집계와 표시 모델
- src/lib/schemas: Zod 입력 검증 스키마와 스키마에서 추론한 폼 타입
- src/mocks: 개발용 데이터
- docs/api: 백엔드 전달용 API 제안 명세
- tests: 집계 및 브라우저 회귀 테스트

Next.js API를 수정하기 전 [AGENTS.md](AGENTS.md)와 설치된 버전의
node_modules/next/dist/docs 가이드를 확인합니다.

A회사 시드·카탈로그와 화면 목 데이터의 출처 및 갱신 방법은 [src/mocks/README.md](src/mocks/README.md)를 참고하세요. `npm run fixtures:sync`는 DB 변경 없이 백엔드 시드에서 공개 JSON을 생성합니다.
