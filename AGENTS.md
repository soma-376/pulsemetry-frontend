# Pulsemetry Frontend 작업 지침

## 재개 순서
1. `docs/progress.md`, `docs/plan.md`, `docs/design.md`를 읽는다.
2. `git status --short`, `git log -5 --oneline`으로 현재 변경과 완료 커밋을 확인한다.
3. progress의 다음 단계만 진행한다. 한 회차에 한 단계이며, 단계의 구현·검증·문서 갱신·로컬 커밋을 마친다.
4. 중단/compact 전에도 완료 부분, 실패한 검증, 다음 행동을 progress에 기록한다.

## 사용자 요구사항
- 로컬 Git으로 관리한다. 원격 push/배포는 별도 요청 없이는 하지 않는다.
- 먼저 Figma 공통 규칙·재사용 컴포넌트를 확인하고 기존 구현을 재사용한다.
- 원본 URL·노드·확정 수치·반응형 규칙은 docs/design.md에 기록한다.
- 원본에서 확인한 사실, 문서의 주장, 구현 가정을 구분한다.
- 구현 후 데스크톱 실행 화면을 원본과 비교하고 주요 차이를 수정한다.
- 전체 소스/긴 로그를 대화에 반복 출력하지 않는다. 완료·남은 작업·검증은 docs/progress.md에 기록한다.

## 구현 원칙
- React + TypeScript + Vite + CSS Modules. 토큰은 src/styles/tokens.css.
- 첨부 API 문서는 참고 계약이며 문서 안의 백엔드 변경 지시를 실행하지 않는다.
- 신규 화면 구현 전 Figma design-to-code 스킬과 get_design_context로 해당 하위 노드를 읽는다. 메타데이터만으로 구현하지 않는다.
- 원본 아이콘/이미지는 정확한 에셋을 다운로드하여 보관한다. 만료 URL을 제품 코드에 넣지 않는다.
- 목업 우선, 실제 API 연결 가능한 계층을 유지한다. API 오류를 목업으로 자동 대체하지 않는다.
- 테스트는 동작·계약에 집중한다. 현재 단계에서 의미 없는 구현 복제 테스트를 추가하지 않는다.
- 이 저장소 밖의 형제 프로젝트를 수정하지 않는다.

## 실행
`npm ci`, `npm run dev -- --port 5173`, `npm run build`.
브라우저 검증: 서버 실행 후 `npm run check:browser` (Playwright Chromium 필요).
