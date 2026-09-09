# 진행 상황

갱신: 2026-09-09. **1단계 완료 — 다음은2단계(P2 기본 지표).**

## 완료 내용
- 0단계: 독립 Git/React/TypeScript/Vite, Figma 변수·API 원본 보관, 공통 토큰/폰트/Button/Badge/KPI/Widget 상태, 컴포넌트 확인 화면.
- 1단계:240/56px 내비, 테마/로그아웃, 라우팅·보호 경로, URL 전역 필터, 수동/5분 새로고침, 커버리지 조회·상세 설명.
- 목업 owner/admin 로그인, member 차단, admin 팀 범위와 P3 직접 접근 제한. 토큰 메모리 보관,401 시 초기화.
- React Router/TanStack Query/MSW 도입. OpenAPI 타입 자동 생성, HTTP 클라이언트·취소·오류·사유 헤더, DataFrame 변환.
- /dev/components로 기존 확인 화면 이동. /dev/api는 목업 상태·부분 실패 검증용. 제품 페이지 본문은 단계별 준비 안내.
- docs/design.md에 원본 치수·추정·시각 차이, docs/api.md에 실행 모드·권한 충돌·목업 제한 정리.

## 검증
| 검증 | 결과 |
|---|---|
| npm test |27개 통과: 프레임/마스킹/URL/권한/HTTP/취소 |
| npm run check:shell |18개 통과, 브라우저 미처리 오류0 |
| npm run check:browser |기존 공통 컴포넌트10개 통과, 콘솔 오류0 |
| npm run build |mock 빌드 성공 (TypeScript 포함) |
| VITE_API_MODE=real npm run build |성공, MSW browser 런타임 청크 제외. 실제 서버 요청 검증은 하지 않음 |
| 원본 비교 |1440에서 sidebar240/toolbar56/coverage28. 컨트롤 너비 원본 수치로 수정 |
| 반응형 |1440/1024/768 가로 넘침 없음,390 안내 |
| 의존성 |OpenAPI 생성기 peer에 맞춰 TypeScript5.9 계열. 전이 js-yaml 취약점 패치 후 npm audit0 |

캡처/측정: validation/phase-1/*.png, results.json. 원본 shell-39-*.txt/png는 reference에 보관.
검증 중 URL 정규화 effect가 빠른 필터 변경을 덮어쓰는 경합을 발견해 현재 URL 일치 검사로 수정. 추가 기간 선택 검증 통과.
공통 좁은 화면 안내 중복을 제거했고 브라우저 상태 선택자는 접근성 이름으로 구체화했다.

## 남은 범위·제한
-2–8단계 대시보드/차트/시나리오/운영/설정 상세 기능은 미구현. CSV 비활성. 시나리오 개수 배지 미표시.
- 실제 API 연결·권한 검증·실서비스 배포는 하지 않았다. real 환경 설정 방법은 docs/api.md.
- 목업은 telemetry_coverage만 구현. 팀별 고정 fixture이며 기간·제품·모델 필터로 수치를 통계 계산하지 않는다. 그 밖의 metric은400 결과. 차트 지표 fixture는2단계부터 추가.
- 상대식 목업은 UI의4개 프리셋/ISO 날짜만 정확히 지원. 실제 API에는 상대식을 그대로 보낸다.
- admin P3 접근은 overview와 YAML이 충돌해 현재 owner만 허용.5단계에서 명세 차이를 다시 다룬다.
- URL 배열 계약은 유지하지만 부서·모델 편집 UI는 단일 선택. 제품은 최소1개.개인 member_ids는 전역 URL에서 받지 않는다.
- 현재 단일 커버리지 위젯. 뷰포트 지연 조회/차트 프레임별 시각화는2단계부터 추가.
- 로그인·준비 화면·날짜 패널·커버리지 상세는 토큰을 사용한 구현 선택. P2 전체 시각 비교는 아직 아님.

## 다음 회차:2단계 시작점
1. AGENTS.md → progress/plan/design/api.md, git status/log 확인.
2. P2 실제 콘텐츠40:4와 하위 KPI·세션·활성시간·사용패턴·산출·비용·토큰 노드를 get_design_context로 읽는다. 원본 계층은 reference/figma-1-4.xml.
3. src/app/Shell.tsx의 셸/필터를 재사용. 후속 위젯에서 공통 정규화 필터 hook을 추출하여 헤더와 본문이 동일한 권한 범위·캐시 키를 사용하도록 한다.
4. Recharts 도입, 위젯별 React Query+뷰포트 지연 조회, 해당 지표의 MSW fixture와 DataFrame 모델 연결. 현재 미지원 metric은400이므로 새 지표를 명시적으로 구현.
5. P2 기본 영역만 구현. 마찰4탭·채택·압축·품질의 상세는3단계.1440/1024 원본 비교와768 검수.
6. 문서 갱신·검증·로컬 커밋 후 회차 종료.

## 실행과 Git
- 실행: `npm ci` → `npm run dev -- --port 5173`. 현재 http://127.0.0.1:5173.
- 목업 로그인에서 owner/admin 입력 버튼 사용. 비밀번호 demo-pulse. 재로드 후 재로그인 필요.
-0단계 커밋 e1d2a77/cd2e81f.1단계 완료 커밋은 `git log -1 --oneline`으로 확인.
- 원격 push/배포 없음. 새 세션에서는 현재 저장소 경로 pulsemetry-frontend에서 재개.
