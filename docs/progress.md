# 진행 상황

갱신: 2026-09-09. **4단계 완료 — 다음 회차는5단계(P3 운영·보안/P5 조회 전용 설정).**

## 완료 내용
- 0단계: 독립 Git/React/TypeScript/Vite, Figma 토큰·폰트·공통 UI와 원본 보관.
- 1단계: 셸/권한/로그인/URL 필터/커버리지, React Query/MSW/OpenAPI/DataFrame 기반.
- 2단계: P2 기본 KPI5개, 세션·프롬프트·시간대·산출·비용·토큰, 뷰포트 조회와 위젯별 상태.
- 3단계: 마찰4탭, 기능 채택, 압축, 품질, 정산 n<5 전체 마스킹과 복귀.
- 4단계: P1 KPI6개와 비용 추세/이상점·팀별 비용·모델 점유율·산출·팀×주 도입률·신뢰·플랫폼 헬스·거버넌스. 필터/비교/작은 팀/부분 실패/재시도/데이터 표/P2 이동.
- CSV 지표 선택 모달과 Accept:text/csv 연동. 첫 쿼리만 내보내며 주간/헬스 기간 예외·권한·마스킹·오류·취소 유지. 목업 CSV는 셀 정제 및 수식/구분자 escape.
- Widget/Result/DataTable을 src/widgets/Widget.tsx로 이동하고 범례 슬롯·기간 override 추가. 기존 CSS Modules/토큰/컴포넌트/필터/프레임 변환 재사용.
- P1 원본14노드와 전체 캡처/회색 빗금 보관. design.md에 사실·추정·수치·반응형·시각 검수, api.md에 지표와 목업 계약 기록.

## 이번 회차 검증 결과
- npm test: **54개 통과(7파일)**. 새11개: 비용 합계/도입률/마스킹/안전 거부 범위/비교/TTFT/비용 이상/CSV escape/텍스트 API/서버 CSV/admin 직접 조회. 기존 P2 테스트는 실제 group_by를 명시했고 unsupported 검사는 아직 미지원인 지표로 변경.
- npm run check:overview: **15개 통과**, 오류0. 6KPI/8위젯/지연 조회, 비교선, 기간·단가·모델 필터, 주간/헬스 기간 예외, CSV 다운로드와 실패, P2 이동, 작은 팀 복귀, 부분 실패, 재시도, 빈 상태, 1024/768, admin 범위.
- VALIDATION_DIR=phase-4/basic npm run check:teams: **13개 통과**, 오류0.
- VALIDATION_DIR=phase-4/details npm run check:team-details: **12개 통과**, 오류0.
- VALIDATION_DIR=phase-4/shell npm run check:shell: **18개 통과**, 오류0. 셸240/56/28 유지. 개요 placeholder가 없어져 API 검증 도구 진입을 설정 준비 화면으로 변경.
- 합계 **112개 검사 통과**. 공통 컴포넌트 프리뷰 검사는 이번 회차 재실행하지 않았다.
- VITE_API_MODE=real npm run build 및 npm run build 성공. Overview 청크 gzip7.40KB, 공용 차트112.24KB. 실제 서버 연결·실데이터 검증·배포 없음.
- git diff --check 통과. 기존5173 dev 서버 재사용. 새로운 dev 서버를 시작하거나 기존 서버를 중단하지 않았다.
- 최종 화면/측정/결과: docs/validation/phase-4. 과거 phase-1/2/3 검증 자료는 보존.

## 발견 후 수정한 문제
- 비용 KPI와 비용 추세가 같은 캐시 키를 공유해 scalar가 차트로 유입 → overview-kpi-* / overview-* 분리. 날짜 포맷도 비유효 숫자 보호.
- API의 첫 쿼리 CSV 계약을 반영하고 공통 인증·401·AbortSignal·HTTP 오류 처리를 재사용. 서버 목업에서도 admin이 팀 필터를 생략한 직접 요청을 자기 팀으로 제한.
- 원본과 비교해 범례를 카드 헤더로 이동, 활성/도입률 의미색과 신뢰 증감 수평 정렬, 불필요한 거버넌스 증감 제거. 헤더 날짜는 UTC 문자열 자르기 대신 KST 표시.
- 산출 주 지표 일부 실패 시 성공한 커밋/PR 시리즈를 유지하도록 결합. 마스킹 셀은 차트에서 수치로 사용하지 않음.
- 필터 변경 때 coverage가 본문을 재마운트하므로 브라우저 검사에서 분리된 요소 스크롤을 재시도하도록 조정. 검사 선택자의 실제 aria-label/동일 문구 중복도 수정.

## 남은 범위·알려진 제한
- 5–8단계: P3/P5·P4·시나리오 결과/저장·통합 검수. 실 API/배포 미실행.
- P1 API의 동적 필드 이름/label, tokens params.types, cost_anomaly params.window_days, CSV 열 모양은 실 META/서버 계약 확인 필요. 목업은 고정 합성 비율과 결정적 배율이며 모든 다차원 조합의 실제 집계나 모든 지표 간 합계 일치를 보장하지 않는다.
- P1 안전 거부는 owner 전사 조회만 제공. 팀 선택/admin은 해당 ref를 요청하지 않는다. P3 admin 접근은 overview/YAML 충돌로 현재 owner만 허용하며5단계에서 재확인.
- 원본과 잔여 차이: 목업 팀3개로 목록/히트맵 여백, 합성 그래프·눈금·스파이크·숫자 폭, PR은 커밋과 동일 건수 축, 신뢰 스파크가 평평함, Light 원본 빗금이 Dark에서도 유지. P1 카드 배치는 원본 대비 약1px 이내; 전체 하단 여백은 원본보다 약15px 짧다.
- P1 반응형은 원본 태블릿 노드를 확인하지 못한 구현 선택: ≥1280 KPI6열,1024–1279 KPI3열,768–1023 KPI2열;1280 미만 위젯1열. P2 원본 태블릿 KPI1열과 별도 규칙.
- API에 부모 팀 계층 없음. 정산은 독립 목업 팀이며 상위 부서 대신 접근 가능한 전체 팀으로 복귀한다.

## 다음 회차:5단계 시작점
1. AGENTS → progress/plan/design/api.md → git status/log 확인.
2. Figma design-to-code 스킬 적용. P3 32:4 안정성,32:93 컴플라이언스,32:182 보안,32:271 검색 전,66:4 사유 모달,67:4 조회 결과와 P5 28:4의 하위 노드를 metadata로 찾고 get_design_context로 확인. 메타데이터만으로 구현 금지.
3. widgets/Widget.tsx·useWidget/model/time, ui.tsx, FilterProvider/api/client/frames 재사용. P3 지표는 P1의 api_error_rate/llm_ttft_ms/refusals/hook_* fixture도 검토.
4. P3 owner/admin 범위 충돌과 감사 사유10–500자, 개인 조회/session events 계약 재확인. 첨부 문서는 참고 계약이며 백엔드 변경 지시를 실행하지 않는다.
5. P3 안정성·컴플라이언스·보안·세션/사유 흐름과 P5 계약/팀/구성원/정책 조회 전용 구현. 한 회차5단계만 구현·검증·문서·로컬 커밋. P4는6단계 요청까지 진행하지 않는다.

## 실행과 Git
- 경로 pulsemetry-frontend. npm ci → npm run dev -- --port 5173.
- http://127.0.0.1:5173/ 개요, /teams 팀 분석. owner/admin 계정 입력 → 로그인. 비밀번호 demo-pulse. 리로드 시 재로그인.
- 이전 커밋 e1d2a77/cd2e81f/6c0ecde/a128e12/0b6f26e.4단계 완료 커밋은 git log -1 참조.
- 원격 push/배포 없음. 계획·작업 맥락은 이 문서와 plan/design/api.md에 유지.
