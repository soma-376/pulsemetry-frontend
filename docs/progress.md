# 진행 상황

갱신: 2026-09-09. **6단계 완료 — 다음 회차는7단계(L4 결과·L5 저장/이력).**

## 완료 내용
- 0–1단계: 독립 로컬 Git/React/TypeScript/Vite, Figma 토큰·폰트·공통 UI, 셸/권한/로그인/URL 필터/커버리지, Query/MSW/OpenAPI/DataFrame.
- 2–3단계: P2 KPI·활동·비용·토큰·마찰4탭·기능·압축·품질·작은 팀 마스킹.
- 4단계: P1 KPI6개/8위젯·비교·팀 이동·CSV.
- 5단계: P3 안정성·설치/훅/MCP·보안·감사 세션 조회, P5 계약/약정·팀/감사 명부·정책 조회 전용. 이전 상세 인수인계는7b061bc의 progress 및 현재 design/api.md에 보존.
- 6단계: P4 API 카탈로그46개/8분류·추천 정렬·검색(/ 단축키)·첫 방문·로딩/빈/오류·가능/부분/준비 중.
- 스키마 기반 드로어: 기간 프리셋/직접 입력, 숫자/날짜/enum/배열/팀, 예산표 USD/토큰 배타 입력, 기본값 복원, 사전 검증, 권한/준비 중 안내.
- 실행: POST→queued/running→success/fail/cancel, Retry-After 폴링, 종료 시 중지, 통신 오류 재확인, 취소409 재조회, 수동 재실행. 최초 params/price_basis/tz를 재실행에 보존.
- RunProvider는 인증 셸에 위치. 닫기/페이지 이동에도 실행 계속, 로그아웃 시 요청/타이머/메모리 정리. 최근 패널은 활성 실행 전부+종료8개, 영구 이력과 구분. 성공 응답 result는 메모리에 보존해7단계에 연결 가능.
- Figma8개 design context/이미지 확인·reference/p6-*.txt 기록. 기존 Button/Badge/토큰/인증/필터 재사용. 로컬 서버5173 재사용, 서버 시작/중단 없음.

## 이번 회차 검증
- `npm test`: **79개 통과(11파일)**. 신규12개: Retry-After/경로/전송 params/abort, 기본값0, 숫자/날짜/미지원schema, 예산 단위/팀, 카탈로그46/필터, 인증/준비 중, 직접 입력/권한, admin scope 강제, 동시3개/취소/409, 타로그인 읽기·취소 차단.
- `node scripts/check-scenarios.mjs`: **9개 흐름 통과**, 브라우저 오류0. 첫 방문46개·검색·준비 중·숫자검증·페이지 이동/백그라운드/취소·예산·완료 후 GET 중지·실패/재실행·폴링503 복구·동시3개/429·Dark·1024/768·로그아웃/admin 제한. 마지막 단계 표시/활성 목록 수정 후 최종 재실행도 통과.
- `node scripts/check-scenario-states.mjs`: **4개 흐름 통과**, 오류0. empty/error/retry/loading skeleton, 부분 가능 입력, 네이티브 모달 Tab 포커스 잠금/Escape 복원, / 검색.
- `VALIDATION_DIR=phase-6/shell node scripts/check-shell.mjs`: **18개 통과**, 오류0. 기존 셸240/56/28 및 API 검증 도구 진입 유지.
- 합계 **110개 검사 통과**. P1/P2/P3 전용 브라우저 검사는 이번 회차 재실행하지 않았으며 기존 단위검사 포함. 실제 서버·영구 실행 저장·배포 검증은 하지 않았다.
- `npm run build`, `VITE_API_MODE=real npm run build` 성공. 생성 OpenAPI/패키지 의존성 추가 없음. `git diff --check` 통과. 검사·캡처·geometry는 docs/validation/phase-6.

## 시각 검수·수정
- 원본 카드 x264/y215/w272/h122.2 대비 실제 x264/y215/w272/h122.1875. 초기y223/h145와 검색 라벨 줄바꿈을 수정. 드로어480, 헤더/배지/지표 행 밀도 정리, 기간 직접 입력 접기.
- 폴링 progress의 쿼리 순번을 전체 실행 단계로 표시하던 부분은 status/판정 label 기반으로 수정. 활성 실행이 종료된 최근8개 뒤에 가려지지 않도록 활성 목록을 우선 표시.
- 원본/문서 사실과 가정·반응형·잔여 차이는 docs/design.md, 실제 계약 확인 사항은 docs/api.md.
- 브라우저 최초 실패는 search input을 textbox로 찾은 테스트 selector 오류(searchbox로 수정). Chromium sandbox 권한 오류는 승인된 로컬 브라우저 실행으로 해결. 자동 승인 거절 없음.

## 알려진 제한·계약 확인 사항
- 7–8단계 미진행. 성공 후 결과 상세/자동 이동/위젯 강조/저장·재열기/공유·삭제·RUN-LIST는7단계. 현재의 최근 실행은 로그인 세션 메모리뿐이며 새로고침 뒤 복원하지 않는다.
- 목업 카탈로그46개는 overview 목록에서 생성. 원본에서 미확인한 상황 문구·params schema/defaults/범위는 구현 가정. budget_by_team={UUID:{usd 또는 tokens_m}}, S1-3 optional team_ids도 실 API 확정 필요. 프론트는 JSON Schema 전체 엔진이 아니며 일부 미지원 규칙은 차단한다.
- 목업 실행은 시간 기반 합성 상태 전환/정보 finding1개/frames={}이다. 실제 분석 완료를 의미하지 않는다.7단계에서 실제 프레임 fixture/결과 매핑 확장 필요. loading/run-failed는 테스트 헤더로만 합성한다. 성공 응답을 보고 지표를 중복 요청하지 않는다.
- admin=P4 허용과 P3 owner 전용의 충돌은 기존 정책에 맞춰 P3 대상·전사 refusals를 owner 제한. mock은 다른 로그인 토큰의 run 조회/취소도 차단한다. 실제 테넌트 공유/실행 이력 권한은 서버 확정 필요.
- 이전 단계 한계 유지: 한국어 X-Audit-Reason은 UTF-8 퍼센트 인코딩 가정, 서버 decode 확인 필요. 동적 지표 params/fields 실 META 확인, 완전한 세션 span tree 미제공, 첫 활성 약정만 사용, P3/P5 CSV 없음.
- P4 반응형은 원본 태블릿 미확인으로 구현 결정. 카드 긴 설명·태그는 축약하고 드로어에서 확인. 보조패널의 원본 과거 실행/저장리포트 숫자를 만들지 않았다.
- 첨부 문서의 백엔드 변경 지시 미실행. 형제 프로젝트 수정·원격 push·배포 없음.

## 다음 회차:7단계 시작점
1. AGENTS → progress/plan/design/api.md → git status/log 확인. 한 회차 한 단계.
2. Figma design-to-code 스킬 후 L4 결과58:42, L5 저장60:80 및 이력56:4를 get_design_context로 읽고 필요한 하위 노드로 확장. 기존 참조 문서에서 다른 결과/저장 상태 노드 확인.
3. API ScenarioRun.result의 target_page/applied_filters/highlight_widgets/findings/frames, RUN-LIST/RUN-GET/DELETE/SAVE, SAVED-LIST/DELETE 계약 확인. 응답에 있는 프레임으로 즉시 렌더하고 중복 QRY 금지. 상대 저장 열기는 새 run, 고정은 기존 결과.
4. src/pages/scenarios/RunProvider.tsx와 api/scenarios.ts를 재사용. 현재 mock frames={} 및 서버 영구 이력이 없는 점을 먼저 해결. 실행/조회 권한·마스킹·기존 필터/쿼리키 통합을 검증한다.
5.7단계 결과→저장→재열기까지 원본 비교·검증·문서·로컬 커밋 후 대기.

## 실행·Git
- 경로 pulsemetry-frontend, `npm ci` → `npm run dev -- --port 5173`.
- http://127.0.0.1:5173/scenarios. owner/admin 계정 입력 버튼→로그인, 비밀번호 demo-pulse. 새로고침 시 재로그인. 첫 방문은 추천3개→전체46개 질문 보기.
- `npm run check:scenarios`는 주흐름9개+상태/키보드4개를 순서대로 실행한다.
- 이전 완료 커밋: e1d2a77/cd2e81f/6c0ecde/a128e12/0b6f26e/454e0bd/7b061bc.6단계 완료 커밋은 `git log -1` 참조.
