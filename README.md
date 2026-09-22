# Pulsemetry frontend

AI 개발 도구 사용량을 살펴보는 Next.js 관리자 콘솔입니다.

## 실행

Node.js와 npm을 설치한 뒤 실행합니다. 의존성 버전은 package-lock.json을 따릅니다.

```sh
npm ci
npm run dev
```

http://localhost:3000 에서 확인할 수 있습니다.

## 화면과 현재 상태

| 화면 | 경로 | 범위 |
| --- | --- | --- |
| 개요 | /overview | 기간별 KPI, 추이, 모델 구성, 상위 3팀과 미배분 요약 |
| 팀 분석 | /teams | 팀 비교, 모델 분석, 사용자 사용량, 팀 상세 드로어 |
| 구성원 | /members | 명단·검색, 초대, 팀 배정, 좌석 회수 UI |
| 설정 | /settings | 벤더 계약, 수집·보존 정책, 알림 규칙 UI |
| 로그인 | /login | 기존 IdP 연동 전 안내 화면 |
| 운영·보안 | /ops | 이번 구현 범위에서 제외된 안내 화면 |

현재 사용량은 src/mocks와 로컬 집계 함수로 제공됩니다.
초대·좌석 회수·계약·정책 변경도 로컬 UI 상태이며 실제 외부 처리는 연결되지 않았습니다.
실제 API 구현과 프론트 DTO 어댑터 연동은 별도 작업입니다.

백엔드 담당자에게는 [화면별 API 구현 요청서](docs/api/README.md)를 전달하면 됩니다.
공통 날짜·금액·권한·페이지네이션 규칙과 화면별 요청/응답 타입, JSON 예시,
저장·초대·회수의 처리 기준이 들어 있습니다.

## 검증

```sh
npm run lint
npx tsc --noEmit
npm test
npm run build
npm run test:e2e
node scripts/check-api-docs.mjs
```

브라우저 테스트는 Playwright Chromium이 필요합니다. 최초 환경에서는
`npx playwright install chromium`으로 설치합니다.
API 문서 검사는 문서의 TypeScript 타입과 JSON 예시를 비교하고 링크·집계 합계를 확인합니다.

## 구조

- src/app: App Router 페이지와 레이아웃
- src/components: 공통 UI, 차트, 화면별 컴포넌트
- src/lib/metrics: 기간·팀·사용량 집계와 표시 모델
- src/mocks: 개발용 데이터
- docs/api: 백엔드 전달용 API 제안 명세
- tests: 집계 및 브라우저 회귀 테스트

Next.js API를 수정하기 전 [AGENTS.md](AGENTS.md)와 설치된 버전의
node_modules/next/dist/docs 가이드를 확인합니다.
