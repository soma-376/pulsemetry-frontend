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
ENROLLMENT_API_URL=http://localhost:8080
DASHBOARD_API_URL=http://localhost:8081
BFF_ORIGIN=http://localhost:3000
BFF_SESSION_KEYS=<openssl rand -hex 32로 생성한 값>
```

회사 이메일로 소속 회사를 찾고 회사에 설정된 OIDC 제공자(개발은 Cognito)의 로그인 페이지로 이동합니다.
프론트 앱 설정에는 비밀번호·OIDC client secret을 넣지 않습니다. 업무 API는 BFF를 거치며, 조회할 조직은 로그인 세션에서만 가져옵니다. Storybook과 브라우저 테스트도 명시적인 세션 fixture를 사용합니다.
서비스 AT/RT는 암호화 HttpOnly 쿠키로 관리하고, 브라우저는 같은 출처의 BFF만 호출합니다.
**Node.js 프로세스 하나로 운영합니다.** 다중 worker·replica·serverless에서는 갱신 공유를 재설계해야 합니다.
키 교체·보안·재시작 시 제약은 [BFF 운영 안내](docs/bff-auth.md)를 따릅니다.
백엔드/Cognito 연결과 정확한 callback 설정은 [OIDC 실행·계약 안내](docs/oidc-login.md)를 따릅니다.
주소를 바꾼 후 개발 서버는 재시작하고, 배포 빌드는 다시 생성해야 합니다.


## 화면과 현재 상태

| 화면 | 경로 | 범위 |
| --- | --- | --- |
| 개요 | /overview | 기간별 KPI, 추이, 모델 구성, 상위 3팀과 미배분 요약 |
| 팀 분석 | /teams | 팀 비교, 모델 분석, 사용자 사용량, 팀 상세 드로어 |
| 구성원 | /members | 명단·검색, 초대, 팀 배정, 좌석 회수 UI |
| 설정 | /settings | 벤더 계약, 수집·보존 정책, 알림 규칙 UI |
| 로그인 | /login | 이메일 회사 탐색·복수 회사 선택 후 실제 OIDC 로그인 |
| 인증 복귀 | /auth/callback | state 검증·단회 코드 교환·관리자/온보딩 확인 |
| 온보딩 | /onboarding | 수집 정책, 서버 벤더·플랜 카탈로그, 계약과 팀 등록 |
| 운영·보안 | /ops | 이번 구현 범위에서 제외된 안내 화면 |

로그인·개요·온보딩·설정은 실제 백엔드 API를 사용합니다. 팀 분석·구성원 화면에는
아직 목 데이터와 로컬 상태가 남아 있습니다. 초대 메일 발송과 벤더 좌석 회수는 연결하지 않았습니다.

실제 렌더링 화면과 소스 코드를 대조한 현재 구현 범위는 [현재 구현 화면 명세](docs/implemented-ui-spec.md)에 정리되어 있습니다.

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
2. `.env.example`을 참고해 BFF·API 주소를 설정하고 [OIDC 안내](docs/oidc-login.md)에 따라 Cognito 신원을 연결합니다. `E2E_OIDC_ORIGIN`과 계정별 `E2E_OIDC_PASSWORDS_JSON`, 실패 UI 선택자를 테스트 프로세스에 주입합니다. 앱·API는 로컬 주소를 사용하며 IdP만 명시한 HTTPS 주소를 사용합니다.
3. `E2E_SEED_DATE`에 **DB 시드를 생성한 기준일**을 설정합니다. 예를 들어 2026-09-28 기준 시드라면 `E2E_SEED_DATE=2026-09-28`입니다. 오늘 날짜로 자동 변경하지 않습니다.
4. Chromium 설치 후 아래 명령을 실행합니다. 프론트엔드 3000번 서버는 자동 실행하며, 이미 실행 중이면 재사용합니다. 환경 변수를 변경했다면 기존 개발 서버를 재시작하세요.

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

테스트가 다루는 범위(작성과 실연동 통과는 별개):

- A/B/C OIDC 로그인, 조직별 조회와 새로고침, 로그아웃, 조직 전환, 401 이후 실제 토큰 갱신을 검사합니다. 계정 전환 테스트만 명시한 IdP 도메인 쿠키를 지웁니다. Cognito 실제 E2E 완료 여부는 별도 실행 결과로 확인해야 합니다.
- 달력에서 시드 기간 선택, A의 관측 인원 8명·환산 비용 $0.525980 검증, 비교 변경, C의 비용 미확정 값을 `-`로 표시.
- 벤더 생성·멱등 재시도·계약 저장·삭제는 실제 API를 호출하는 **보조 검증**입니다. 브라우저 폼으로 온보딩을 완료하는 테스트는 아닙니다. A에 고유 이름의 벤더를 만들고 `finally`에서 해당 벤더만 삭제하며, 온보딩 상태가 이전과 같은지 확인합니다. 서버의 삭제·감사 이력은 남을 수 있습니다.

수집 정책 변경·온보딩 완료·시드 초기화는 실행하지 않습니다. 정상 API 응답을 가로채지 않으며, 서버가 없거나 구버전이면 선행 조건 오류로 실패합니다. 실패 스크린샷은 `.e2e-artifacts/backend`에 저장합니다. 실제 인증 토큰이 포함될 수 있는 네트워크 trace는 기본적으로 저장하지 않습니다.

기존 목 API 브라우저 테스트는 `tests/browser`에 유지하며 별도 설정으로 실행합니다.
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
