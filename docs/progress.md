# 진행 상황

갱신: 2026-09-09. **2단계 완료 — 다음은3단계(P2 상세 영역).**

## 완료 내용
-0단계: 독립 Git/React/TypeScript/Vite, Figma 토큰·폰트·공통 UI와 원본 보관.
-1단계: 셸/권한/로그인/URL 필터/커버리지, React Query/MSW/OpenAPI/DataFrame 기반.
-2단계: /teams 기본 KPI5개, 세션 시작 유형, 프롬프트 분포,7×24 KST 패턴, 산출(LoC/커밋/PR), 비용4차원, 토큰 누적과 보조 비율.
- 공통 FilterProvider/useScopedFilters 추출, useWidget 뷰포트 조회·5분 폴링, DataFrame 차트 모델, 위젯별 재시도·데이터 표.
- 원본1024는 모든 카드1열임을 확인해 기존2열 추정을 수정. 데스크톱/태블릿 캡처·원본·확정 치수는 design.md와 reference/p2-*.
- 산출은 종료일 기준 완료8주, 나머지 전역 기간. 합성 목업과 실제 계약의 차이는 api.md.

## 검증
- npm test:34개 통과(기존27+위젯 계약7).
- npm run check:teams:13개 통과, 미처리 브라우저 오류0. 필터/단가/비교/마스킹/부분 실패/재시도/지연 조회/권한/1440·1024·768.
- npm run build:성공. P2 지연 청크 gzip 약122KB, Recharts는 /teams 진입 시 로드.
- 시각 비교에서 세션 행 높이, 삭제 음수 막대, KST 월요일 경계, 범례·캡션 위치를 수정했다.
- npm run check:shell:18개 통과. P2 준비 안내가 사라진 뒤 개발 도구 링크를 찾던 검사를 개요 경유로 갱신했다. 결과는 phase-2/shell.
- npm run check:browser:기존10개 통과, 오류0.
- VITE_API_MODE=real npm run build:성공. 실제 서버는 연결하지 않았다.
- git diff --check:통과. 의존성 설치 npm audit0. 초기 Vite 의존성 갱신 중 로그인 실패는 후속 실행에서 재현되지 않았다.

## 남은 범위·제한
-3단계:마찰4탭·기능 채택·컨텍스트 압축·품질·작은 팀 마스킹 상세. 현재 해당 영역은 구현 예정 안내.
-4–8단계:P1/P3/P4/P5·시나리오·CSV·통합검수. 실 API/배포 미실행.
- 원본 하위팀 계층은 API에 없어 현재 META 팀을 공유 필터로 선택. 정산 n<5 사례는3단계에 계약 근거 확인 후 추가.
- 목업은 결정적 배율·패턴이며 통계 엔진이 아니다. 실 API의 분포 필드 이름·가용성·누락 데이터는 통합 때 확인 필요.
- 원본과 남은 차이: 합성 시계열/자동 눈금, 24시간 잘림 수정, 원본 light 빗금은 dark에서도 같은 색.
- 비교값은 KPI에 표시, 차트는 현재 기간 시리즈를 렌더한다. 현재 단계의 비교 차트 상세는 범위 밖.
- admin P3 접근은 overview/YAML 충돌로 owner만 허용.5단계에서 재확인.

## 다음 회차:3단계 시작점
1. AGENTS → progress/plan/design/api.md → git status/log.
2. P2 마찰42:224, 기능43:22, 압축43:134, 품질43:182 및 상태44:22/44:1011/44:2011/45:94 하위 노드를 get_design_context로 확인.
3. src/pages/teams/Teams.tsx와 공통 ui.tsx 재사용. Widget/Result/DataTable은 현재 Teams.tsx 내부에 있으므로 후속 페이지에서 재사용할 때 공통 파일로 추출. src/widgets/useWidget.ts,model.ts,time.ts와 filterContext.tsx는 이미 공통.
4. API 카탈로그의 지표/마스킹과 원본 탭 매핑을 확인하고 teamMetrics.ts에 필요한 fixture 추가. 현재 unsupported metric은400.
5. 한 회차3단계만 구현·검증·문서·커밋. 전체 P2 비교와 n<5를 검수하고4단계로 넘긴다.

## 실행과 Git
- 경로 pulsemetry-frontend. `npm ci` → `npm run dev -- --port 5173`.
- http://127.0.0.1:5173/teams. 목업 owner/admin 계정 입력 → 로그인. 비밀번호 demo-pulse. 리로드 시 재로그인.
- 이전 커밋 e1d2a77/cd2e81f/6c0ecde.2단계 커밋은 완료 후 git log -1 참조.
- 원격 push/배포 없음. 검증 자료 validation/phase-2/results.json과캡처, 원본 reference/p2-*.
