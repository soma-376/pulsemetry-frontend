# 진행 상황

갱신: 2026-09-09. **5단계 완료 — 다음 회차는6단계(P4 시나리오 카탈로그·실행 흐름).**

## 완료 내용
- 0단계: 독립 Git/React/TypeScript/Vite, Figma 토큰·폰트·공통 UI/원본.
- 1단계: 셸/권한/로그인/URL 필터/커버리지, Query/MSW/OpenAPI/DataFrame.
- 2–3단계: P2 KPI·활동·비용·토큰·마찰4탭·기능·압축·품질·작은 팀 마스킹.
- 4단계: P1 KPI6개/8위젯·비교·팀 이동·CSV. 상세 인수인계는 이전 커밋과 design/api.md.
- 5단계 P3: 안정성4차트/도구별 실패 표, 설치 커버리지·무활동 필터·페이지 이동·훅 실행/차단·manifest/MCP, 안전 거부·429 타임라인·벤더 불일치·정책 거절/러버스탬프.
- P3 세션: 4종 식별자·사유10–500자 모달·조회·이벤트/메타·cursor·조회 종료/취소·404·기간 변경 시 제거. 프롬프트 원문/임의 payload 표시하지 않으며 토큰·비용은 llm_call 로그만.
- P5: 조회 전용 헤더/앵커, 계약·배율·약정 소진, 팀·감사 사유 후 구성원 이메일/현재 페이지 검색, 정책/signal/이력. 개인 응답은 로컬 컴포넌트 메모리만 사용한다.
- OpenAPI 응답 별칭/GET 클라이언트와 MSW 계약/fixture 추가. 목업 감사 메모리 기록, 직접 API 권한/사유 검사, AbortSignal/세대 번호로 늦은 응답 차단.
- Figma9개 design context와 P5 metadata 확인. 원본 코드 reference/p5-*.txt, 실제 캡처·geometry/results는 validation/phase-5. 기존 공통 토큰/Widget/Result/쿼리/프레임/Radix 탭 재사용.

## 이번 회차 검증
- `npm test`: **67개 통과(9파일)**. 신규13개: 허용 필드/원문·스팬비용 제외, duration 0/null, 이메일 마스킹, 한국어 사유/path/abort, 직접 권한/사유 길이, 설치 무활동, cursor/404, 마스킹/0, 실패율 분모, 상대 기간, 감사 기록, 훅 일별 합계.
- `npm run check:operations`: **16개 통과**, 브라우저 오류0. 안정성/TTFT2선/위젯 오류 재시도/empty/masked, 설치·60일, 훅 부분 실패, 전사 거부 범위, 세션 사유 전 무요청/한글/페이지/취소 후 미복원/종료/404/필터 변경, 설정 gate/배율/검색/cursor/권한, Dark와1024/768 캡처.
- `VALIDATION_DIR=phase-5/shell npm run check:shell`: **18개 통과**, 오류0, 셸240/56/28 유지. 설정이 준비 화면에서 바뀌어 API 검증 도구 링크는 시나리오 준비 화면으로 진입하도록 검사 수정.
- `VALIDATION_DIR=phase-5/overview npm run check:overview`: **15개 통과**, 오류0. 기존 필터·CSV·팀 이동·마스킹 회귀. script에 출력 디렉터리 override를 추가해 과거 자료 보존.
- 합계 **116개 검사 통과**. P2 전용 브라우저 검사/공통 UI 프리뷰는 이번 회차 재실행하지 않았다(기존 단위검사는 포함).
- `npm run build`, `VITE_API_MODE=real npm run build` 성공. P3 청크 gzip7.68KB/P5 5.59KB. 실 서버 연결/실데이터/영구 감사 저장/배포는 검증하지 않았다.
- `git diff --check` 통과. 기존5173 dev 서버 재사용, 서버 시작/중단 없음. 로컬 커밋 완료 후 다음 단계 대기.

## 수정한 문제와 시각 검수
- 첫 TTFT가 percentile label을 잃어1선으로 합쳐짐 → p50/p90 구분. 과도한 보안 높이 → 러버스탬프를 추세 옆으로 이동.
- 오류 의미색/헤더 범례/도구 실패율 임계5%·빨강/429 원/훅 복합 차트/정책 요약/반원 게이지 중심/명부 팀 열 수정.
- P3 카드 x264/848 폭568 일치. 안정성 y153.39/높이241.875로 원본보다 약1.4px/6px 차이. 자세한 원본·반응형·잔여 차이는 design.md.
- 한국어를 직접 Headers에 넣을 수 없어 UTF-8 퍼센트 인코딩 사용(명세 미정). mock decode 후10–500자 검증. 실제 서버 지원은 다음 연동 작업의 확인 사항.
- 브라우저 검사 초기 경로 전환의 분리된 DOM/잘못된 부서 aria-label을 수정. 최종16개 모두 통과. 남은 실패 검사 없음.

## 알려진 제한·확정이 필요한 계약
- P3 owner만 허용: Figma/overview와 YAML의 admin 세션 허용이 충돌한다. P5 admin은 계약/정책/자기 팀 읽기, 명부 이메일·전사 약정은 owner만. 실제 정책 결정 필요.
- API 동적 필드/params와 감사 헤더 인코딩은 실 META/서버 확인 필요. 계약 약정은 첫 활성 term_commitment 사용, 복수 선택 미구현. CSV는 개요만 지원.
- 원본의 미설치/구버전 집계·manifest 버전별 잔존/배포 간격/프라이버시 상세·레지스트리 출처·예상 소진일·감사 ID·사용자/턴 집계는 API에 없어 임의 수치를 만들지 않았다. 완전한 스팬 트리는 미구현이며 parent_id와 현재 페이지 타임라인을 제공한다.
- 목업은 팀3개·명부/설치 샘플12개·결정적 합성 이벤트다. 전체 실집계·모든 다차원 합계 일치를 보장하지 않는다. 설치 상태 active는 설치 등록 상태로 무활동 여부와 별개다. false signal은 OFF로 표시한다.
- P3/P5 반응형은 원본 태블릿 미확인으로 ≥1280 다열/768–1279 한 열로 결정. 안전한 메타 줄바꿈/원본 미제공 필드/합성 곡선에 따른 차이가 남는다.
- 6–8단계 미진행. 실제 API/배포 없음. 첨부 문서의 백엔드 변경 지시는 실행하지 않았다.

## 다음 회차:6단계 시작점
1. AGENTS → progress/plan/design/api.md → git status/log 확인.
2. Figma design-to-code 스킬 후 P4 카탈로그51:4, 비용 드로어52:4/예산53:4, 실행52:425/실패52:812, 첫 방문54:4/로딩54:369, 준비 중57:4, 이력56:4를 작은 하위 노드로 get_design_context 확인.
3. API `/scenarios`, `/scenarios/{scenario_id}`, `/scenario-runs` 실행·조회·취소와 availability/params_schema/동시 실행 한도/에러 계약 확인. P4 카탈로그·검색·파라미터·실행·폴링·취소·실패·준비 중까지. 결과 상세/저장·재열기는7단계 범위.
4. 기존 Widget/UI/필터/API/AbortSignal/권한 재사용. 새로운 라이브러리/백엔드 변경은 필요하지 않으면 추가하지 않는다. 지연 요청/언마운트/필터 변경 취소 패턴 참고.
5. 회차6단계만 구현·원본 비교·검증·문서·로컬 커밋 후 대기.

## 실행·Git
- 경로 `pulsemetry-frontend`. `npm ci` → `npm run dev -- --port 5173`.
- http://127.0.0.1:5173/operations /settings. owner 계정 입력→로그인, 비밀번호 demo-pulse. 재로드 시 재로그인. 세션 샘플 `sess_demo`(기본7d 범위); call_id=`call_demo`, request_id=`req_demo`, installation_id=`inst_1`.
- 이전 커밋 e1d2a77/cd2e81f/6c0ecde/a128e12/0b6f26e/454e0bd.5단계 완료 커밋은 `git log -1` 참조.
- 원격 push/배포 없음. 재개 맥락은 이 문서·plan/design/api.md·로컬 Git에 유지.
