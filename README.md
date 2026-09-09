# pulsemetry-frontend

Pulsemetry React 관리자 콘솔. **4단계: P1 개요·CSV와 P2 팀 분석 전체 구현 완료.**

## 실행
```sh
npm ci
npm run dev -- --port 5173
```

http://127.0.0.1:5173 에서 `owner 계정 입력` 또는 `admin 계정 입력` → 로그인. 데모 비밀번호는 `demo-pulse`입니다. 로그인 상태는 메모리에 보관되어 새로고침 후 재로그인합니다.

- `/`: 개요 대시보드·CSV. `/teams`: 팀 분석 전체. `/operations`, `/scenarios`, `/settings`: 단계별 준비 화면.
- `/dev/components`: 공통 컴포넌트 확인.
- `/dev/api`: 로그인 후 목업 상태 제어·부분 실패/마스킹 검증.
- 실제 API 전환: [API 문서](docs/api.md), [.env.example](.env.example) 참고. 실제 서버는 연결하지 않았습니다.

```sh
npm run generate:api
npm test
npm run build
# 개발 서버 실행 후
npm run check:browser
npm run check:shell
npm run check:teams
npm run check:team-details
npm run check:overview
```

Playwright Chromium은 `npx playwright install chromium`으로 설치합니다. 검증 환경은 Node26/npm11이며 Node22.12 이상을 사용하세요. 폰트는 로컬 번들에 포함됩니다.

## 작업 이어가기
[진행 상황](docs/progress.md) → [계획](docs/plan.md) → [디자인 근거](docs/design.md) → [API 기반](docs/api.md). 매 회차 한 단계의 구현·검증·문서·로컬 커밋을 마칩니다. 원본은 docs/reference, 캡처와 검증 기록은 docs/validation에 보관합니다.

## 3단계 팀 분석

로그인 후 `/teams`에서 기본 KPI와 마찰4탭·기능 채택·압축·품질을 확인합니다. 정산 팀을 선택하면 n<5 전체 마스킹 안내를 확인할 수 있습니다. 메뉴의 데이터 표 보기로 수치를 읽을 수 있습니다. `npm run check:teams`는 P2 브라우저 검증이며 실행 서버가 필요합니다. 완료 내용과 다음 단계는 [docs/progress.md](docs/progress.md)를 참고하세요.

## 4단계 개요

`/`에서 KPI6개, 비용/산출 추세, 팀별 비용, 모델 점유율, 팀×주 도입률, 신뢰/플랫폼 헬스/거버넌스를 확인합니다. 팀 이름을 누르면 필터를 유지하며 팀 분석으로 이동합니다. CSV에서 지표 하나를 선택해 내보냅니다. 작은 팀 값은 비공개이며 안전 거부는 owner 전사 조회에서만 제공합니다.
