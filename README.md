# pulsemetry-frontend

Figma 기반 React 관리자 콘솔. **0–8단계 구현과 목업 기반 통합 검수 완료.** 실제 백엔드 연결·배포는 별도 후속 작업입니다.

## 실행

```sh
npm ci
npm run dev -- --port 5173
```

http://127.0.0.1:5173 에서 `owner 계정 입력` 또는 `admin 계정 입력` → 로그인합니다. 데모 비밀번호는 `demo-pulse`입니다. 인증은 메모리에만 보관되어 새로고침 후 재로그인합니다. 목업 실행·저장 리포트는 같은 브라우저의 localStorage에 보존됩니다.

| 경로 | 기능 |
|---|---|
| `/` | 개요 KPI·추세·팀 비교·CSV |
| `/teams` | 팀 분석·마찰4탭·기능 채택·압축·품질·n<5 마스킹 |
| `/operations` | 운영·보안·컴플라이언스·사유 입력 후 세션 조회(owner) |
| `/settings` | 계약·팀·구성원·수집 정책 조회, 개인 정보 사유 입력 |
| `/scenarios` | 46개 카탈로그·입력·실행·폴링·취소 |
| `/runs/:runId` | 결과·판정·위젯 강조·저장·재실행 |
| `/scenarios/history` | 실행 이력·저장 리포트·재열기·삭제 |
| `/dev/components` | 공통 컴포넌트 확인 |
| `/dev/api` | 로그인 후 목업 상태 제어(목업 모드만) |

데스크톱·태블릿768px 이상, Light/Dark 지원. admin은 자기 팀 범위이며 운영·보안은 owner만 접근합니다. 화면의 통계·시나리오 결과는 합성 데이터입니다.

## 검증

```sh
npm test
npm run build
# 5173 개발 서버를 실행한 상태에서
npm run check:integration
# 특정 검사만 실행
node scripts/check-integration.mjs teams reports
```

`check:integration`은 공통 UI/셸/P1–P5/시나리오/저장·이력/키보드·반응형 검사를 순서대로 실행합니다. 각각 독립 브라우저 컨텍스트를 사용하고 결과는 `docs/validation/phase-8/`에 저장합니다. 일부 흐름은 수십 초 걸리며 전체 약3분입니다. 실패해도 다른 검사를 계속하고 마지막 종료 코드로 실패를 반환합니다.

Playwright Chromium 설치가 필요하면 `npx playwright install chromium`을 실행합니다. Node22.12 이상, 검증 환경 Node26/npm11. 폰트는 로컬 번들입니다.

실제 API 모드의 **로컬 HTTP 응답 대역 검사**:

```sh
VITE_API_MODE=real npm run build
npm run check:real-api
# 기본 목업 빌드로 복원
npm run build
```

이 검사는4174 포트에 임시 preview를 열고 종료합니다. 실제 서버에 연결하는 검사는 아닙니다. 실제 연결 설정은 [.env.example](.env.example)과 [API 문서](docs/api.md)를 참고하세요. 실제 API 오류를 목업으로 대체하지 않습니다.

## 인수인계

[진행 상황](docs/progress.md) → [계획](docs/plan.md) → [디자인 근거](docs/design.md) → [API 계약](docs/api.md). 원본은 docs/reference, 검증 증거는 docs/validation. 다음 세션은 AGENTS.md와 이 문서들을 읽고 Git 상태를 확인합니다.

잔여 제한: 실제 META/시나리오 분석 엔진 미검증, 결과 화면은 반환 프레임만 표시, P3/P5 CSV·완전한 세션 span tree 없음. 감사 헤더·공유·삭제 정책 등 미확정 서버 계약은 docs/api.md에 구분해 기록했습니다. 후속 작업은 사용자 요청으로 범위를 정합니다.
