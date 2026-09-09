# 진행 상황

갱신: 2026-09-09. **7단계 완료 — 다음 회차는8단계(통합 검수).**

## 완료 내용
- 0–6단계: 독립 React/TypeScript/Vite/Git, 공통 토큰/UI, 인증·셸·필터·권한·DataFrame, P1/P2/P3/P5, P4 카탈로그46개·입력·실행/폴링/취소. 이전 상세는 f0d7d07의 progress 및 현재 design/api.md.
- 7단계: `/runs/:runId` 결과 뷰, 열린 드로어 완료 시 자동 이동, 직접 링크/로그인/새로고침 복원, 실행 시점 필터 배너·읽기 전용 헤더, 지표/위젯 강조·판정/근거·관련 위젯 포커스 이동, 해제→대상 페이지.
- 반환 DataFrame만 표시하며 결과 페이지 QRY0. 기존 어댑터/WidgetCard/Badge/Button/DataTable 재사용. 부분 실패·0/미관측/마스킹 구분, 다중 수치 필드는 잘못 연결하지 않고 표 표시.
- 고정/상대 저장 모달(name/note/time_mode), 성공/실패·재시도, 고정 결과 재열기/상대 새 run, 공유 링크 복사, 실행 이력/저장 목록·커서 페이지 이동·삭제 확인/취소/409 처리.
- RunProvider가 기존 결과/폴링을 재사용하며 새 GET 활성 실행도 인계. 삭제 시 Provider·GET 캐시 정리, 로그아웃 시 메모리/요청/캐시 정리. admin 자기 팀/P3 제한 및 삭제 권한 적용.
- mock 결과 fixture/이력/저장 API 확장, 토큰 없는 합성 DB만 localStorage에 보존. 테스트 owner/admin member_id 구분. 실제 API 모드는 목업을 로드하지 않음.
- Figma 결과/저장/이력 원본 확인. 전체 노드가 sparse인 경우 배너/판정/모달 하위 design context 재조회. source/확정값/가정·차이는 docs/design.md, API 해석과 한계는 docs/api.md에 기록.

## 검증 결과
- `npm test`: **91개 통과(13파일)**. 신규12개: 저장/204/커서, filter 평면·중첩 및 개인 차원 제외, 상대 params/단가 보존, admin 결과 scope, 마스킹/link, 반환 프레임/기간, 저장 검증·mode, 연결된 저장 삭제409/204/404, 커서·권한, 활성 실행 차단, admin의 서버 강제 scope 재실행.
- `node scripts/check-reports.mjs`: **8개 흐름 통과, 오류0**. 자동 결과/28d/위젯 포커스/QRY0, 저장 실패→재시도 및 고정/상대 저장, 고정 POST0/상대 새run, Dark/1024/768 넘침0, reload→로그인→결과, 해제, 삭제 확인/취소/원본 유지, 삭제 링크404.
- `node scripts/check-report-states.mjs`: **6개 흐름 통과, 오류0**. 부분 오류·성공 ref 유지/마스킹 payload·판정 숨김/0·null, 모달 Tab/Escape/포커스 복원, 12개 실행 커서/이전, 목록503/재시도, 로그아웃/admin 빈 목록, 과도한 서버 응답도 admin 결과 뷰에서 차단.
- `VALIDATION_DIR=phase-7/scenarios node scripts/check-scenarios.mjs`: **기존9개 흐름 통과, 오류0**. 성공 검사만 새 결과 자동 이동으로 변경; 입력·취소·실패·재시도·폴링 오류·동시3개/429·권한 회귀 검사 유지. phase6 원본 캡처를 덮어쓰지 않도록 출력 디렉터리 인자 추가.
- `VALIDATION_DIR=phase-7/shell node scripts/check-shell.mjs`: **18개 통과, 오류0**, 셸240/56/28 유지.
- 합계 **132개 검사 통과**. P1/P2/P3 전용 브라우저 및 check-scenario-states는 이번 회차 미재실행(기존 단위 검사는 모두 포함).8단계에서 전체 통합 검수.
- mock/real `npm run build` 모두 성공. 결과 화면은 lazy import하여 차트 초기 번들 분리. 의존성/생성 OpenAPI 변경 없음. `git diff --check` 통과.
- 캡처/검사 결과/geometry: docs/validation/phase-7. 로컬5173 서버 재사용, 시작·중단/사용자 브라우저 탭 변경 없음. 실제 서버/배포/영구 서버 저장 검증 없음.

## 시각 검수와 해결한 실패
- 원본 비용 카드 x264/y182.1/w512, 팀 비용 x792/w248, 판정 x1056/y140/w360. 실제 x264/y182.09375/w512, x792/w248, 판정 x1056/y140/w360. 카드 높이325.875(원본321.9, 표 펼치기 제어 포함), 판정은 실제2개 finding에 따른 가변 높이589.86(원본3개652).
- 수정: 태블릿 본문 패딩16과 margin−24 불일치의8px 넘침→−16, 중복 강조선 제거,512:248 비율, UUID 대신 팀 이름 축 라벨, 차트/모달 간격, 활성 탭 밑줄. Light/Dark/1024/768 실행 화면 확인.
- 네이티브 dialog의 Tab이 문서 밖으로 나가는 경우를 명시적 순환으로 보완. React autofocus 뒤 opener를 캡처하던 문제는 렌더 시 opener 보존+close 이후 포커스 복원으로 수정; 최종 검사 통과.
- 최초 Chromium sandbox의 Mach port 권한 오류는 승인된 로컬 브라우저 실행으로 해결. Figma screenshot URL DNS 제한은 도구의 inline screenshot으로 확인. 자동 승인 거절 없음.
- 상태 검사 초기 selector는 실제 위젯 ID 매핑과 달라 실패하여 별도 metric 속성으로 검사. 작업 중 MSW 모듈 갱신으로 토큰이 초기화된 시도는 소스 수정 완료 후 재실행. 실패 기록은 최종 성공으로 덮지 않고 이 항목에 설명.

## 알려진 한계·확인할 계약
- L4는 반환 프레임 전용 뷰. 원본의 흐리게 표시된 비관련 KPI/전체 대시보드는 응답에 없으면 재조회/임의 값으로 채우지 않음. 해제하면 기존 전체 대시보드로 이동. metric_id→위젯 대응39개는 overview 표, cost의 frame_type 구분은 가정. 서버의 단가·차원별 정확한 프레임 매핑 확인 필요.
- 합성 결과는 실제46개 분석 엔진이 아님. 기존 fixture에서 아직 지원하지 않는 조합은 빈 프레임. 원본의 특정 비용 사건/판정 숫자를 실제 계산처럼 표시하지 않음. 실제 메트릭·SCN params schema 검증은 서버가 필요.
- mock 저장소는 같은 브라우저의 localStorage 합성 DB이며 실제 서버 저장/다중 탭 동기화가 아님. owner 테넌트 전체/admin 자기 실행·팀만이라는 공유 제한, 활성 실행/연결 saved 존재 시 삭제409는 구현 가정. 서버의 실제 같은 테넌트 관리자 공유·삭제 정책 확인 필요.
- saved에 상세 params가 없어 relative 열기 시 원본 RUN-GET→SCN-RUN. params가 실행 당시 원본 상대식을 유지하고 applied_filters가 단가/tz를 반환해야 함. 실패 run에 result 단가가 없고 원래 input도 없는 경우 재실행 기본 단가 list; 서버 계약 보완 필요.
- 반환 마스킹 지표를 참조하는 finding은 제목/근거/권장까지 보수적으로 숨김. evidence.metric_id 없으면 전체 프레임 마스킹 기준. 실 API 마스킹/권한 확인 필요. 현재 UI timezone은 KST 고정.
- 이전 한계 유지: 한국어 X-Audit-Reason 퍼센트 인코딩 가정, 첫 활성 약정만 표시, 완전한 세션 span tree/P3·P5 CSV 없음. details는 docs/api.md 및 이전 커밋 progress 참조.
- 첨부 문서 안 백엔드 변경 지시 미실행. 형제 저장소 수정·원격 push·외부 게시·배포 없음.

## 다음 회차:8단계 시작점
1. AGENTS → progress/plan/design/api.md → git status/log. 한 회차 한 단계.
2. 통합 점검 범위를 먼저 정리: P1/P2/P3/P4/P5 및 결과/이력, owner/admin, Light/Dark,1440/1024/768, 키보드, loading/error/empty/masked/partial, URL/로그아웃/재열기.
3. 기존 검사 scripts/check-*.mjs 재사용. 새 결과·이력은 npm run check:reports. 기존 시나리오 체크는 성공 자동 이동 반영 완료. fixture 파일/DB는 합성이며 필요하면 테스트 컨텍스트에서 초기화.
4. 원본과 주요 차이 비교 후 수정. 특히 실제 API dynamic params/지표별 frame_type/fields/labels 매핑 및 결과 화면의 원본 비관련 대시보드 처리 차이를 확인. 실 서버 없이 확인 불가능한 계약은 사실/가정으로 유지하고 연결됐다고 보고하지 않기.
5. 필요한 검사만 재실행, docs/validation/phase-8 및 design/api/progress 갱신, 로컬 커밋 후 대기.

## 실행·Git
- 프로젝트: pulsemetry-frontend. `npm ci` → `npm run dev -- --port 5173`.
- http://127.0.0.1:5173/scenarios, http://127.0.0.1:5173/scenarios/history.
- owner/admin 계정 입력 버튼→로그인, 비밀번호 demo-pulse. 새로고침은 재로그인 필요.7단계 목업 실행·저장은 재로그인 후 복원 가능.
- 이전 완료 커밋 f0d7d07(6단계),7b061bc(5단계).7단계 완료 커밋은 `git log -1` 참조.
