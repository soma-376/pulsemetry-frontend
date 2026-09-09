# pulsemetry-frontend

Pulsemetry 관리자 콘솔을 위한 React 프론트엔드. 현재 **0단계 공통 디자인 기반**이 구현되어 있습니다.

## 실행
Node.js 22.12 이상 권장.

```sh
npm ci
npm run dev -- --port 5173
```

개발 서버: http://127.0.0.1:5173

현재 루트 화면은 공통 컴포넌트 확인 화면입니다. 로그인·대시보드·실제 API 연동은 아직 구현하지 않았습니다. 폰트는 npm 패키지를 통해 로컬 빌드에 포함되어 외부 폰트 서비스에 의존하지 않습니다.

```sh
npm run typecheck
npm run build
# 개발 서버 실행 후
npm run check:browser
```

Playwright Chromium이 없으면 `npx playwright install chromium`으로 설치합니다.

## 작업 이어가기
- [진행 상황](docs/progress.md)
- [단계별 계획](docs/plan.md)
- [디자인 근거와 규칙](docs/design.md)
- [작업 지침](AGENTS.md)

API 원본과 Figma 추출 자료는 docs/reference, 시각 검증 결과는 docs/validation에 있습니다.
