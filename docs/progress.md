# 진행 상황

갱신: 2026-09-09. **3단계 완료 — 다음 회차는4단계(P1 개요).**

## 완료 내용
-0단계: 독립 Git/React/TypeScript/Vite, Figma 토큰·폰트·공통 UI와 원본 보관.
-1단계: 셸/권한/로그인/URL 필터/커버리지, React Query/MSW/OpenAPI/DataFrame 기반.
-2단계: P2 기본 KPI5개, 세션·프롬프트·시간대·산출·비용·토큰, 뷰포트 조회와 위젯별 상태.
-3단계: 마찰4탭(언어 수락률/자동 승인/권한 대기/거절 출처), 기능 채택(MCP/명령/도구 액션), 압축, 품질, 정산 n<5 전체 마스킹과 복귀·정책 안내.
- 공통 Widget/Result/DataTable을 pages/teams/Widget.tsx로 추출. 기존 FilterProvider/useWidget/프레임 변환 재사용. 탭별 API 요청과 캐시, 키보드 전환, 부분 실패·재시도·표 지원.
- 정확한 원본8노드와 빗금 SVG 보관. 데스크톱/다크/1024/768 및 상세·작은 팀 화면 비교. 사실/가정과 수치는 design.md/API 계약은 api.md에 기록.

## 검증 결과
- npm test:43개 통과(6파일). 상세 fixture·행 마스킹·분위수·MCP 범위·오류 합계·압축 합계·커버리지 수치 생략 포함.
- npm run check:team-details:12개 통과.4탭·키보드·지연 조회·부분 실패·재시도·빈 상태·준비 중·작은 팀·1024/768. 미처리 오류0.
- VALIDATION_DIR=phase-3/basic npm run check:teams:기존13개 통과, 오류0.
- VALIDATION_DIR=phase-3/shell npm run check:shell:기존18개 통과, 오류0. 셸240/56/28px 유지.
- 합계86개 검사 통과. 이 회차에서 기존 공통 컴포넌트 프리뷰 검사는 재실행하지 않았다.
- VITE_API_MODE=real npm run build 및 npm run build 성공. P2 지연 청크 gzip126.64KB. 실제 서버 연결/실데이터 검증은 하지 않았다.
- git diff --check 통과. 기존5173 서버를 재사용했고 확인 중 시작된5174 서버는 종료했다.
- 최종 캡처/결과는 docs/validation/phase-3. geometry.json의 y는 문서 좌표.

## 발견 후 수정한 문제
- 탭 재마운트/로딩 때 키보드 포커스 소실 → controls 슬롯에서 목록 유지.
- 전체 마스킹 이후 위젯 표 상태가 초기화됨 → 회귀 검사를 현재 동작에 맞춤.
- 커버리지 재조회 오류가 전체 본문을 제거 → 같은 필터의 기존 응답이 있으면 위젯별 오류/재시도 유지.
- 캡처 시 화면 밖 위젯의 이전 빈 상태를 기다리지 않음 → IntersectionObserver 갱신·로딩 종료와 품질 값 확인 후 촬영.
- 대기 시간 축과 박스 기준점 불일치, 압축 축 잘림·색상, 기능/품질 카드 높이 수정. 압축 일별 횟수 합계와 요약 횟수도 일치시킴.

## 남은 범위·알려진 제한
-4–8단계:P1/P3/P4/P5·시나리오·CSV·통합검수. 실 API/배포 미실행.
- MCP scope 필터/실패 params 및 table 추가 필드 이름은 실 META 계약 확인 필요. 목업은 고정 비율과 결정적 배율을 가진 fixture로 모든 조합의 실제 집계를 재현하지 않는다.
- API에 하위 부서 관계 없음. 정산은 독립 목업 팀이며 원본 상위 부서 복귀 대신 접근 가능한 전체 팀으로 복귀한다.
- 원본과 잔여 차이: 합성 시계열·눈금, 숫자 폭·줄바꿈, 거절 출처의 펼칠 수 있는 표, dark에서도 원본 light 빗금. 기능/압축 높이363px(원본360.6), 품질319px(원본318.5).
- admin P3 접근은 overview/YAML 충돌로 owner만 허용.5단계에서 재확인.

## 다음 회차:4단계 시작점
1. AGENTS → progress/plan/design/api.md → git status/log.
2. P1 원본19:4의 하위 KPI·추세·비교·채택·마찰·안정성 노드를 metadata로 탐색하고 get_design_context로 확인한다. 메타데이터만으로 코드 작성 금지.
3. 기존 공통 ui.tsx, pages/teams/Widget.tsx, widgets/model.ts·useWidget.ts·time.ts와 filterContext.tsx 재사용. 다른 페이지 공용화가 필요하면 Widget을 widgets 디렉터리로 옮길 것.
4. P1 페이지에서 필터·비교 기간·CSV·P2 이동을 구현하고 필요한 metric fixture를 명시적으로 추가한다. 현재 unsupported는400.
5. 한 회차4단계만 구현·검증·문서·로컬 커밋. P3 구현은5단계 요청까지 진행하지 않는다.

## 실행과 Git
- 경로 pulsemetry-frontend. npm ci → npm run dev -- --port 5173.
- http://127.0.0.1:5173/teams. owner/admin 계정 입력 → 로그인. 비밀번호 demo-pulse. 리로드 시 재로그인.
- 이전 커밋 e1d2a77/cd2e81f/6c0ecde/a128e12.3단계 완료 커밋은 git log -1 참조.
- 원격 push/배포 없음. 계획·작업 맥락은 이 문서와 plan/design/api.md에 유지.
