# 진행 상황

갱신: 2026-09-09. **8단계 완료 — 계획한0–8단계 목업 기반 콘솔 구현·통합 검수 종료.** 후속 작업은 사용자 요청으로 범위를 정한다.

## 완료 내용
- 0–7단계: React/TypeScript/Vite 독립 Git, 디자인 토큰·공통 UI, 인증·셸·전역 필터·권한·DataFrame, P1 개요/CSV, P2 팀 분석 전체, P3 운영·보안/감사, P5 조회 전용 설정, P4 카탈로그46개/실행, 결과·저장·이력·삭제·재열기. 이전 단계 상세는 ea86e20의 progress와 현재 design/api.md.
- 8단계: 모든 기존 검사 통합 실행, owner/admin·Light/Dark·1440/1024/768 검수, Figma 시각 비교·팀 선택 스타일 수정, 모달/기간 팝오버 포커스 수정, 페이지별 탭 제목·reduced-motion 이동 지원.
- 리포트의 검증된 포커스 처리를 components/dialogFocus.ts로 공유하여 시나리오/감사/리포트에 적용. CSV에도 Tab 경계 순환. Button은 React19 ref 전달을 타입에 반영. 기존 토큰/레이아웃/차트/상태 컴포넌트 재사용.
- `check:integration`, `check:accessibility`, `check:real-api` 추가. 기존 스크립트는 VALIDATION_DIR로 이전 단계 기록 보존. README를 전체 완료 기능/실행/검증/인수인계 기준으로 갱신.

## 최종 검증 결과
- **총277개 검사 통과:** 단위91개(13파일) + 브라우저182개 + real 빌드 HTTP 대역4개. 반복 실행은 합계에 중복 포함하지 않음.
- 브라우저11개 suite: components10, shell18, teams13, team-details12, overview15, operations16, scenarios9, scenario-states4, reports8, report-states6, accessibility71. 모든 suite 종료0, 기록된 pageerror0. 각 suite의 콘솔 수집 범위는 스크립트 참조(모든 console warning이 없다는 주장이 아님).
- 전체 기존 핵심 흐름: URL/역할/로그아웃, 차트/표/CSV, 비교·기간·모델·팀, 지연 조회, error/empty/partial/masked/0, 감사 사유/취소/개인 결과 제거, 실행→성공/실패/취소→결과→고정/상대 저장→재열기→삭제.
- 새71개: 기간 Escape/취소 복귀, 시나리오 및 감사 Tab/Shift+Tab/Escape 복귀6개; 페이지 제목9개; P1–P5 접근 가능한 역할×Light/Dark×1440/1024/768 넘침54개; skip link·런타임2개. 기존 reports 상태 검사에서 저장 모달 포커스 및 마스킹 재검증.
- `npm run typecheck`, `npm test`, mock/real `npm run build` 성공. 첨부 YAML을 임시 재생성한 타입과 src/api/schema.d.ts 바이트 일치. 최종 기본 dist는 목업 빌드.
- real 빌드4개: Bearer 로그인·503 실패 유지, MSW 등록0/목업 헤더 없음, 명시적 재시도→서버 빈 목록,401→로그인. **Playwright HTTP 대역 검사이며 실백엔드 연동 검증 아님.** 임시4174 preview 종료, 기존5173 서버 유지.
- 자료: docs/validation/phase-8/suite-results.json 및 각 폴더 results/geometry/PNG. 키보드 수정 전 실패는 accessibility/initial-results.json에 보관. 긴 로그는 대화에 반복하지 않음.

## 시각 검수·발견한 문제와 수정
- Figma 툴바39:38와 팀 선택40:6 design context 재확인. 원본 p1-desktop/p2-desktop/p2-tablet, 기존 수치 및 실행 캡처 비교. 최신 P2 전체 완료 캡처는 team-details/desktop-light.png·desktop-dark.png.
- 팀 선택의 흰색/파란색 활성 스타일을 원본 text/1 + misc/on-inverse로 수정. 비선택 text/2를 명시하여 Dark 가독성 복구. 원본 버튼26px·바32px·border1/radius6 반영. 이후 P2 상세 Light/Dark/1024/768 검사12개 재통과.
- 셸240/56/28 유지. P1 비용762.66×322, P2 세션373.33×274.375, 산출568×437. 주요 위치/그리드 일치; 폰트/표 높이 약0–3px 미세 차이와 합성 데이터/축 차이는 design.md에 기록.
- 실제 키보드 실패5건: 날짜 Escape/취소, 시나리오 닫기, 감사 Tab 순환/닫기 복귀. 공통 포커스 처리로 모두 해결. 모든 경로에 디자인 시스템 제목이 남던9건도 페이지 제목으로 해결. 초기 audit selector는 즐겨찾기 ★를 반영하지 않아 멈췄으며 선택자를 보정 후 검증했다.
- P2 검사 첫 실행에서 normal 전환 후 캐시 읽기 비율이 이전 partial 상태로 남아 실패. 단독 재실행은 성공. 검사에서 새로고침의 META→위젯 무효화 단계를 기다리지 않고 스크롤하던 경합을 확인하여 해당 모드 coverage 응답을 기다리게 보정, 전체 재실행 통과. 제품 쿼리/무효화 정책은 변경하지 않음.
- 편집 중 공유 모달 추출의 잔여 cleanup 구문/미사용 import는 typecheck에서 발견해 수정 후 통과. real HTTP 대역의 saved 경로는 실제 /saved-reports로 바로잡고 재통과. 초기 실패를 성공으로 가장하지 않음.

## 알려진 한계·확인할 계약
- L4는 반환 프레임 전용 뷰. 원본의 흐리게 표시된 비관련 KPI/전체 대시보드는 응답에 없으면 재조회/임의 값으로 채우지 않음. 해제하면 기존 전체 대시보드로 이동. metric_id→위젯 대응39개는 overview 표, cost의 frame_type 구분은 가정. 서버의 단가·차원별 정확한 프레임 매핑 확인 필요.
- 합성 결과는 실제46개 분석 엔진이 아님. 기존 fixture에서 아직 지원하지 않는 조합은 빈 프레임. 원본의 특정 비용 사건/판정 숫자를 실제 계산처럼 표시하지 않음. 실제 메트릭·SCN params schema 검증은 서버가 필요.
- mock 저장소는 같은 브라우저의 localStorage 합성 DB이며 실제 서버 저장/다중 탭 동기화가 아님. owner 테넌트 전체/admin 자기 실행·팀만이라는 공유 제한, 활성 실행/연결 saved 존재 시 삭제409는 구현 가정. 서버의 실제 같은 테넌트 관리자 공유·삭제 정책 확인 필요.
- saved에 상세 params가 없어 relative 열기 시 원본 RUN-GET→SCN-RUN. params가 실행 당시 원본 상대식을 유지하고 applied_filters가 단가/tz를 반환해야 함. 실패 run에 result 단가가 없고 원래 input도 없는 경우 재실행 기본 단가 list; 서버 계약 보완 필요.
- 반환 마스킹 지표를 참조하는 finding은 제목/근거/권장까지 보수적으로 숨김. evidence.metric_id 없으면 전체 프레임 마스킹 기준. 실 API 마스킹/권한 확인 필요. 현재 UI timezone은 KST 고정.
- 이전 한계 유지: 한국어 X-Audit-Reason 퍼센트 인코딩 가정, 첫 활성 약정만 표시, 완전한 세션 span tree/P3·P5 CSV 없음. details는 docs/api.md 및 이전 커밋 progress 참조.
- 첨부 문서 안 백엔드 변경 지시 미실행. 형제 저장소 수정·원격 push·외부 게시·배포 없음.

## 후속 작업 / 새 세션 재개
1. AGENTS → progress/plan/design/api.md → git status/log. 계획0–8은 완료이며 자동으로 새 단계를 만들지 않는다.
2. 실제 연동 요청 시 API 주소·인증·테넌트 권한을 확인하고 META 지표/params 응답으로 매핑을 검증한다. 첨부 문서의 백엔드 변경 지시 자체는 사용자 작업 요청이 아니다.
3. 위 알려진 제약(실서버 계약/CSV/span tree/반환 프레임 뷰)을 사용자 요청 범위에 따라 후속 작업으로 정한다. 실서비스/배포 완료라고 보고하지 않는다.
4. 현재 `npm run check:integration`으로 재검증 가능. 5173 서버가 필요하며 일반 사용자 브라우저 탭은 바꾸지 않는다.

## 실행·Git
- 프로젝트 pulsemetry-frontend. `npm ci` → `npm run dev -- --port 5173`.
- http://127.0.0.1:5173/ · /teams · /operations · /settings · /scenarios · /scenarios/history.
- owner/admin 계정 입력→로그인, 비밀번호 demo-pulse. 재로드 시 재로그인; 목업 실행·저장은 같은 브라우저에서 복원.
- 직전 완료 ea86e20(7단계).8단계 완료 커밋은 `git log -1` 참조. 독립 로컬 Git 관리, 형제 저장소 변경/원격 push/배포/외부 메시지 없음.
