# API 기반과 목업 계약

## 계층
- 원본: reference/pulsemetry_api_spec.yaml. `npm run generate:api` → src/api/schema.d.ts. 수동 수정 금지.
- `--default-non-nullable false`로 서버 default가 있는 요청 필드를 필수로 잘못 생성하지 않는다.
- src/api/types.ts: 필요한 OpenAPI 타입 별칭. client.ts: Bearer/JSON/AbortSignal/감사 사유/HTTP 오류·401 처리.
- src/api/frames.ts: 4개 frame_type의 평행 배열을 행 단위 cell로 변환. 필드 labels/meta 유지. 깨진 열 길이/타입은 해당 결과 오류.
- 셀 state는 value/missing/masked/zero-denominator. 0은 유효 값. suppressed 또는 group_size<5인 원래 값은 버린다. 한 그룹이 한 프레임이라는 명세에 따라 suppressed_groups가 있으면 숫자 필드 전체를 보수적으로 가린다.
- React Query 캐시 키: 옵션은 사용자·역할·기간, 위젯은 역할·위젯명·정규화 URL 필터. signal로 이전 요청 취소. 실패 자동 재시도/포커스 재조회 없음. 수동 새로고침과5분 주기만 제공.
- 차트는 위젯마다 `['widget', widgetId, role, serializedFilters]` 쿼리를 사용하고 queries[]에는 해당 위젯의 시리즈만 담는다. 뷰포트 지연 로딩은2단계에 구현했다.

## 실행 모드
- 기본 mock: MSW 브라우저 worker 시작 후 React 렌더. 로그인/ME/META-FILTERS/QRY만 구현.
- `.env.local`: `VITE_API_MODE=real`, `VITE_API_BASE_URL=https://your-api.example/v1` 후 개발 서버 재시작. 이 URL은 예시이며 실제 서버 연결/검증하지 않았다. 서버 CORS가 필요하다.
- real 모드에서는 worker를 시작하지 않으며 실제 요청 실패를 목업으로 대체하지 않는다. 클라이언트 인증 토큰은 저장소에 기록하지 않는다.
- mock 계정: owner@pulsemetry.test / admin@pulsemetry.test, 비밀번호 demo-pulse. 로그인 토큰은 목업 서비스 메모리에1시간 보관. 새로고침하면 클라이언트 토큰이 사라져 재로그인한다.
- 목업 고정 시각2026-09-07T09:44:12Z. 기간 프리셋과 ISO 날짜, h/d/w 및 일·주 정렬은 응답 resolved_from/to에 반영. 그 밖의 상대식/월 단위 정밀 해석은 실제 서버의 책임이며 현 목업은 지원하지 않는다.
- 커버리지 fixture: 결제11/12, 전체32/36. 제품·모델·기간은 요청에 반영되지만 fixture 숫자를 통계 계산하지 않는다. 2단계 지표 fixture는 아래 별도 절에 정리했다. 지원하지 않는 metric_id는400 결과를 반환한다.
- `/dev/api`의 목업 상태는 이 탭 sessionStorage에 보관하며 헤더로 MSW에만 전달: normal/empty/masked/partial/error/meta-error/loading. normal로 되돌리면 정상 복구. partial은 두 번째 ref만504. 개발용 두 위젯은 계약 검사용이다.

## 권한과 명세 충돌
- [문서] overview는 owner 전 페이지, admin P1/P2 자기 팀/P4/P5 읽기, member 로그인 불가.
- [문서] YAML은 P3 세션 API를 owner/admin+감사 사유로 허용하므로 overview의 페이지 목록과 차이가 있다.
- [결정] 현재 P3 페이지는 owner로 제한.5단계에서 세션 기능 권한을 구현할 때 이 충돌을 명시적으로 다룬다. UI 권한은 서버 검사의 대체가 아니다.
- admin URL의 권한 밖 팀을 제거하고 접근 가능 팀으로 요청. MSW도 전역/쿼리별 team_ids를 검사하며 빈 배열을 자기 팀 전체로 해석한다.
- member_ids는 전역 URL 필터에서 받지 않는다. 감사 사유10–500자 클라이언트 검증이 준비돼 있고 개인 필터에 사유가 없으면 MSW가 거부한다. 실제 세션/전체 이메일 조회 흐름은5단계다.
- `/me`의 자신의 이메일은 계정 영역에 표시. 타인의 전체 이메일은 이번 단계에서 조회하지 않는다.

## 검증 범위
Vitest: DataFrame 상태/평행 배열/필드 labels, URL 정규화·범위 제한, 목업 권한과 부분 실패, HTTP 헤더·401·취소·사유 검증. 실제 서버의 JSON 전체 런타임 스키마 검증은 아직 없으며 OpenAPI 정적 타입과 명시적인 DataFrame 구조 검증을 사용한다.

## 2단계 위젯 계약
- FilterProvider/useScopedFilters가 헤더·본문의 권한 정규화/URL/옵션 캐시/5분 설정을 공유한다. 본문 제목의 커버리지는 헤더와 동일 캐시 키를 재사용한다.
- useWidget은 IntersectionObserver로 현재 화면에 들어온 위젯만 조회한다. 벗어나면 자동 폴링을 멈춘다. 필터 변경 시 새로운 키로 요청하며 이전 필터 데이터를 placeholder로 보여주지 않는다. 새로고침은 모든 widget 키를 무효화하고 화면 밖은 다음 진입 시 갱신한다.
- KPI: active_users/adoption_rate/cost/active_time(group_by=type, user 선택)/automation_ratio. 세션: sessions(start_type). 분포: prompts_per_session. 패턴: usage_heatmap(weekday,hour). 산출: lines_of_code(type),commits,pull_requests를 한 위젯 요청의A/B/C로 묶는다.
- 비용: cost(model/query_source/agent_name/mcp_server) 4개 ref와 subagent_cost_ratio. 토큰: tokens(type,events)와 cache_read_ratio. 지원 목록 밖 metric은 기존처럼400 결과다.
- [결정] 미정인 DataFrame 필드 이름은 value/value_compare, distribution bucket/count 및 별도 p50/p90 숫자 필드로 목업 계약을 정했다. 그룹 라벨은 항상 fields[].labels에 있고 그룹마다 프레임을 분리한다. 실제 API 통합 시 META-METRICS/반환 필드 이름과 맞춰야 한다.
- model.ts가 적응된 셀만 시각화에 전달한다. 숫자0 보존, null은 끊김/미관측, 마스킹 숫자는 폐기, 분모0은 계산 불가. 부분 실패 시 성공 ref는 유지하고 실패 부분에 재시도를 제공한다. 마스킹 그룹이 포함된 단일 차트는 전체를 보수적으로 가린다.
- [결정] 산출의 시간창만 최근 완료8주로 별도 조회: now-8w/w → now/w 또는 ISO KST 월요일 경계. 목업 상대식 지원을 h/d/w 및 /d,/w까지 확장했다. 월 단위/그 밖의 임의 상대식 정밀 해석은 여전히 미지원이다.
- [목업] teamMetrics.ts는 합성 fixture다. 결제7일 공시 기준 원본 숫자11명/318세션/$502.88/186.4시간을 사용하며 기간 길이·팀·제품·모델에 결정적 배율을 적용한다. 계약은 가정 할인20%. 이는 실제 통계 집계나 실제 계약 할인율이 아니다. 실제 API 실패를 이 데이터로 대체하지 않는다.
- [목업] 제품·모델 선택은 수치 배율에 반영하며 모델별 비용은 선택 모델로 제한한다. 모든 차원의 실제 상관관계/기간별 활성 구성원 추이까지 재현하지 않는다. 분포 분위수는 고정이며 히트맵은 생성 패턴이다. 비용 모델 명칭은 기존 META 옵션과 맞추었다.
- [목업] partial은 두 번째 ref504. 산출·비용·토큰 각각의 성공/실패 혼합을 검증했다. zero/missing/masked의 차이는 단위 테스트와 데이터 표에서 검증한다.

## 3단계 상세 계약과 한계
- 마찰: edit_acceptance_rate(language), auto_approval_ratio(decided_by), gate_wait_ms(decision, distribution), tool_rejections(tool_name,decided_by,limit5). gate_wait_ms는 ms 단위 p50/p90/count를 표시하고 평균/개인 축은 제공하지 않는다.
- 기능: mcp_connections(server_name,server_scope,transport_type), command_prompt_ratio, tool_calls(action). 스킬/플러그인은 실제 지원 지표로 가장하지 않고 원본대로 준비 중.
- 압축: compactions(trigger)·compaction_reduction 일별 추세와 scalar 요약4ref. 목업의 정수 일별 횟수 합계는 scalar 횟수와 맞춘다. 절감률은 API 정의대로 토큰 합계 기준. 시계열 절감률은 합성 패턴이며 해당 가중치 원본 토큰은 목업에서 생성하지 않는다.
- 품질: tool_calls(error_type,limit8), tool_failure_rate, mcp_failure_ratio(server_name). 오류 유형 조회 params.success=false 및 MCP params.server_scope=org는 META params_schema가 없는 현재의 명시적 가정이다. 응답 server_scope=org 라벨도 확인하며 누락/다른 scope의 MCP 값은 표시하지 않는다. 실 API 지원 확인 필요.
- [가정] table 필드: acceptance_rate/decisions/auto_approved, ratio/numerator/denominator, p50/p90/count, rejections, connections/failure_ratio, calls, failure_rate/failures/calls. API overview의 반환 의미에 기반했지만 특히 자동 승인 제외 수, scope 라벨 및 추가 params의 실제 명칭/가용성은 서버 계약 확인이 필요하다. 오류 시 목업 대체 없음.
- [목업] teamDetails.ts에서 상세 지표를 명시적으로 제공한다. 제품/모델/기간·팀 배율을 개수에 반영하고 비율/분위수는 고정. group_by와 특정 params에 대해 필요한 조합만 구현한 fixture이며 일반 통계 엔진이 아니다. 직접 호출의 모든 잘못된 조합을 검증하지는 않는다.
- [목업] 정산33333333-3333-4333-8333-333333333333 추가(owner만 접근). 선택 시 모든 지표 numeric payload는 null/suppressed. 커버리지의 정확한 설치/구성원 수는 응답에서 생략하고 ratio=null. group_size=3은 기존 마스킹 계약 테스트용 메타데이터다. 전체 fixture는35/39(결제11/12+플랫폼21/24+정산3/3). 앞선32/36 fixture를 대체한다.
- [보호] 마스킹 여부는 coverage 프레임에서 판정한다. 최초 coverage 응답 전 본문 조회를 보류한다. coverage 재조회 실패 시 같은 필터의 이전 응답이 있으면 위젯별 오류/재시도를 유지한다. 필터 변경은 별도 캐시 키이므로 이전 팀 숫자를 보여주지 않는다.
- [보호] 언어 표만 공개 가능한 행을 남기고 작은 그룹의 모든 수치를 숨긴다. 다른 상세 집계는 마스킹 값이 섞이면 보수적으로 해당 결과를 가린다. 전역 작은 팀은 KPI·차트·상세 표·커버리지 숫자를 화면에서 모두 제거한다.
- 부분 실패 시 성공 ref를 유지하고 실패 ref를 재시도한다. 마스킹/미관측/0/분모0은 변환 계층에서 구분하며 데이터 표는 정제된 셀만 사용한다.

## 4단계 P1/CSV 계약
- P1: active_users/adoption_rate/cost/cost_per_active_user/sessions/lines_of_code scalar, cost 일 추세(공시/계약 별 ref)+cost_anomaly, cost(team), tokens(model)+model_users(model), lines_of_code/commits/pull_requests 주 추세+integration_depth, adoption_rate(team,1w), 편집/자동 승인 scalar+일 추세, api_error_rate/llm_ttft_ms 시간 추세, refusals/hook_blocking/hook_executions.
- [문서] integration_depth=(commits+pull_requests)/fresh. cost_anomaly=일 비용/직전N일 평균−1. model_users는 모델별 중복 사용자. refusals는 team 분해 금지 및 홉 중복 가능. 훅은 detailed tracing 전제. API 오류율은 시도 단위일 수 있다.
- [가정] tokens params.types=['input','output'], cost_anomaly params.window_days=7의 파라미터 명칭/가용성은 META에서 실서버 확인 필요. 단일 수치 필드 value + value_compare, TTFT percentile label, 팀 식별 label team/team_name, hook_executions의 sessions_with_hooks/sessions는 목업 프레임 규약. 실 API와 필드 선택 매핑을 확인해야 한다. API 원본은 반환 필드의 정확한 동적 schema를 강제하지 않는다.
- [목업] overviewMetrics.ts에서 위 조합을 명시적으로 추가. P2 table(language/decided_by)와 P1 scalar 집계를 분리. 기존 상세 테스트도 실제 P2 group_by를 명시하도록 정정. unsupported 검사는 새로 지원한 refusals 대신 vendor_account_mismatch로 유지.
- [목업] 일 비용을 센트 누적 반올림하여 scalar 합계와 일치. 공시/계약은20% 할인 fixture. 직전7일 평균 이상값은 fixture 이전 구간을 기준값1로 채운 합성 결과. 비용 팀 분해는 전체35인 대비21/11/3, 작은 팀 값은 null. 기간/제품/모델 선택에 결정적 배율 적용; 비율·분위수·비교 기준은 고정 합성값이며 완전한 다차원 집계 엔진이 아니다. LoC scalar/주 추세, 모델별 토큰 등 모든 서로 다른 쿼리의 합계 일치를 보장하지 않는다.
- [권한] 목업 query마다 최상위/쿼리 filters를 병합한 뒤 admin의 팀 범위를 서버 측에서도 강제한다. admin이 team_ids를 생략해도 자기 팀만 반환. refusals는 선택 팀 또는 team group_by에403. UI는 owner 전사에서만 해당 ref를 요청하고 CSV 선택지에도 같은 제한 적용.
- [기간] 주간 산출/도입률은 completedWeeks(to), 헬스는 now-24h→now/compare none. useWidget override를 요청과 캐시 키에 반영. KPI는 overview-kpi-*와 차트 overview-*로 분리. 기존 coverage 캐시 키는 셸/P1/P2가 공유한다.
- [문서] POST /query의 Accept:text/csv는 첫 쿼리 frames만 반환. 클라이언트 api.queryCsv는 Bearer/AbortSignal/401 공통 처리 후 text를 받는다. 실패 시 파일 생성 없음. 닫기/Escape/필터 변경/페이지 이동으로 pending 요청 취소.
- [목업/결정] CSV는 metric/frame/row/field/labels/value/unit/state 열의 long-form이며 서버 CSV 열 모양은 실계약 확인 필요. adaptResult로 마스킹/분모0/미관측 구분, null을0으로 변환하지 않음. 문자열의 수식 접두사와 쉼표/따옴표/줄바꿈 escape. 실제 서버 CSV의 마스킹과 수식 escape는 백엔드 응답에서 검증해야 하며 실서버 확인은 하지 않았다.

## 5단계 운영·보안/설정 계약
- OpenAPI 생성 파일은 변경하지 않았다. api/operations.ts에서 paths 기반 응답 별칭과 GET 클라이언트 추가: /meta/contracts, /meta/teams, /meta/members, /meta/manifests, /installations, /sessions/{id}/events. Authorization/401/AbortSignal/HTTP 오류는 기존 request를 사용한다. 실제 실패를 목업으로 대체하지 않는다.
- P3 QRY: api_error_rate(status_code), llm_duration_ms(p50/p95/p99), llm_ttft_ms(percentile=p50/p90), api_retry_attempts(ratio), tool_failure_rate(tool_name), hook_executions(hook_event 및 scalar 세션수), hook_blocking, mcp_connections(server/scope/transport/is_plugin), refusals(category), rate_limit_events(model), vendor_account_mismatch(table), tool_rejections(config/hook), rubber_stamp_ratio. 기존 프레임 어댑터의 null/0/분모0/suppressed/n<5 동작을 재사용한다.
- 동적 지표 필드(`ratio`, p50/p95/p99 label, table calls/failures/top_error_type, MCP sessions), `tool_rejections.params.decided_by`, `rubber_stamp_ratio.params.threshold_ms=2000`, `contract_commitment_burn.params.contract_id`는 실 META로 확정해야 하는 구현 가정이다. 새 목업은 화면에 사용하는 조합만 구현한다. P2 기존 조합은 기존 fixture로 전달한다.
- 안전 거부는 owner+전사만. UI는 해당 요청의 team_ids/member_ids를 비우고 다른 전역 필터는 유지한다. 설정 전사 약정 소진률은 owner만, 활성 term_commitment 첫 계약의 시작일~now/contract 단가. 복수 활성 약정 선택 UI는 미제공이며 첫 계약임을 구현 기준으로 삼았다.
- **권한 충돌:** overview §2-1은 admin=P1/P2/P4/P5, Figma P3 검색은 owner 전용. YAML SESSION-EVENTS는 owner/admin. 현재 P3/직접 세션 목업은 owner로 제한한다. P5 계약/정책은 admin 읽기 가능, 팀은 자기 팀; 전체 명부 이메일과 전사 약정 집계는 owner. 실 서버 정책 결정 필요.
- **감사 사유:** overview는 전체 이메일도10–500자 필수. P5 명부는 사유 입력 전 요청하지 않는다. SESSION-EVENTS/명부의 각 페이지 요청에도 사유를 보낸다. 브라우저 Headers는 한국어 문자열을 직접 담을 수 없어 `encodeURIComponent(trimmed reason)`으로 X-Audit-Reason 전송, 목업은 decode 후 길이를 검사한다. **이 인코딩 규약은 첨부 명세에 없는 구현 가정이며 실제 서버 디코딩 지원 확인이 필수**다. 백엔드를 수정하지 않았다.
- 감사 모달은 사용자 입력을 수집하는 제품 흐름이다. API 모킹에서는 승인된 조회의 role/시각/path/사유를 작업자 메모리의 최대100개 mockAuditRecords에 기록한다(실 감사 저장소 아님). 클라이언트는 응답에 없는 audit_id나 감사 영구 저장 성공을 만들지 않는다. UI 사유·개인 결과는 localStorage/sessionStorage/URL/Query 캐시에 저장하지 않는다. 조회 종료·필터 변경·탭/페이지 이동·로그아웃 시 제거하고 진행 요청을 abort, 늦게 도착한 응답도 generation으로 무시한다. 메모리 감사 로그는 의도된 서버 목업 기록으로 별도 유지한다.
- SessionEvent.payload는 임의 JSON으로 출력하지 않는다. model/tool_name/decision/decided_by/status_code/attempt/is_error/prompt_length/duration_ms만 선택. 토큰 input/output·cost_usd는 signal=log,type=llm_call에만. 원문 content/prompt·중첩 임의 데이터·스팬 비용/토큰은 출력하지 않는다. API에 없는 사용자/감사 ID/턴 집계는 생략. parent_id는 표시하지만 완전한 스팬 트리는 미구현이다.
- 목록 cursor는 응답의 불투명 next_cursor를 그대로 다음 요청에 전달하고 이전 stack을 메모리로 유지한다. 명부 검색은 현재 페이지에서만. 세션 fixture ID: session_id=sess_demo 또는 sess_01J7Q9K3M8XQ, request_id=req_demo, call_id=call_demo, installation_id=inst_1. 기준 사건은2026-09-03 KST. 최근24h로 조회하면 빈 이벤트가 정상이며 기본7d에서는14개/페이지8개가 반환된다.
- 설치 응답은 도메인만 보이고 UI도 로컬 부분을 다시 가린다. 30/60/90일 무활동은 last_event_at 기준; admin 직접 다른 팀 요청403. 설정 signals는 bool 그대로 ON/OFF이며 준비 중/수집 상세/프라이버시 값으로 확장하지 않는다.
- 목업 계약 배율0.82/0.8/0.75/0.88, 활성manifest14/적용33/배정35. 실제값 아님. 훅 차단 시계열은 같은 기간·필터의 기존 scalar 합계와 같게 정수 누적 반올림. 그 외 모든 지표 간 합계·실제 다중팀 집계를 보장하는 fixture는 아니다. 약정 소진은 단일 활성 계약의 합성69840/120000이다.
- P3/P5 CSV는 현재 미제공(개요 CSV만 구현). 실 서버 API 요청/계정/영구 감사 로그/실제 배포 검증은 하지 않았다.

## 6단계 시나리오 카탈로그·실행 계약
- 생성 OpenAPI는 수정하지 않았다. api/scenarios.ts는 ScenarioSummary/Detail/Run 및 SCN-LIST/SCN-RUN의 생성 타입 별칭 사용. GET /scenarios, GET /scenarios/{id}, POST /scenarios/{id}/runs, GET /scenario-runs/{id}, POST /scenario-runs/{id}/cancel. URI encode, 공통 Bearer/401/AbortSignal/에러 request_id 유지.
- 공통 request에 선택적 응답 headers 콜백만 추가. POST/GET의 Retry-After 초를 폴링 지연으로 사용(기본2초, 최소1초). queued/running만 다음 GET 예약, 성공/실패/취소 시 중지. 알 수 없는 상태/누락ID는 오류. 네트워크 실패는 기존 실행을 보존하고 폴링을 멈춰 명시적 재확인 제공. POST를 자동 재시도하지 않는다.
- RunProvider는 인증된 셸에 위치하여 드로어 닫기·다른 페이지 이동에도 폴링 유지. 로그아웃/언마운트 시 타이머·요청 취소/메모리 제거. 이는 서버 실행 취소와 다르며 명시적인 실행 취소만 cancel API 호출. 재로그인·새로고침 뒤 과거 실행 복원은7단계의 RUN-LIST/RUN-GET 작업이다.
- 시작 중 중복 클릭은 동기 ref로 차단. 취소/상태 재확인은 이전 GET을 abort하고 세대 번호가 같은 응답만 반영. 종료된 실행 취소409는 GET으로 실제 상태 재확인. 취소 통신 실패는 종료됐다고 단정하지 않는다. 재실행은 최초 RunInput(params/price_basis/tz)의 복사본 사용, 반환 params에서 새 입력을 임의 추정하지 않는다.
- **폼 스키마 가정:** 첨부는 params_schema를 자유 JSON으로만 정의하고46개 실제 schema/defaults를 제공하지 않는다. mock은 overview §6-2 목록에서 schema를 만들고 날짜/숫자범위/배열/enum 기본값을 설정했다. budget_by_team={teamUUID:{usd?:positiveNumber,tokens_m?:positiveNumber}}이고 둘 중 하나 필수. S1-3의 optional team_ids는 Figma의 팀 입력에 따른 확장 가정. moving_avg_days=7,spike_threshold_pct=200은 Figma 근거. 다른 숫자/날짜 기본값은 구현 가정이다.
- 프론트 검증은 지원하는 JSON Schema 하위집합(기본 type/required/enum/최소·최대/배열 items/추가속성/날짜)이다. $ref/oneOf/anyOf/allOf/not/if/pattern은 실행을 차단한다. 전체 JSON Schema 엔진은 아니며 실제 서버가 최종 검증자다. 실 META 확인 후 미지원 스키마를 확장해야 한다. 임의 날짜/상대 기간 순서·예산 배타 단위·선택팀도 추가 검사한다.
- [권한 가정] admin 실행은 소속 팀으로 강제. P3 결과는 기존 화면 접근과 같은 owner 제한, 전사 refusals도 owner 제한. 명세상 P4 admin 허용과 P3 연결의 상세 권한 계약은 실제 서버 확인 필요. MSW가 직접 호출의 타팀·P3·전사 거부를403으로 차단한다. 목업 실행 읽기/취소는 같은 로그인 토큰으로 제한(실제 테넌트 공유/역할 규칙 확정 아님).
- [목업] 카탈로그46개, 카테고리8개. source 제목/상황 일부+overview 목록. 동시 실행3개(단일 목업 테넌트), queued→running→약6.5초 후 succeeded. 실제 분석 엔진이 아니며 생성 결과는 info1개/frames={}이다. 전역 필터 적용/실제 프레임 결과는7단계 목업을 확장해야 한다. 종료 상태는 진행시간 기준으로 결정되므로 GET 횟수에 따라 분석이 빨라지지 않는다.
- [목업 검증 모드] X-Mock-Case=empty/error/loading은 카탈로그 빈 목록/503/2.5초 지연. 실행 loading은 계속 진행 상태, run-failed는 query_timeout 실패를 합성한다. normal은 성공. 실제 API 오류에서 목업으로 전환하지 않는다. 준비 중409/입력400/타팀403/한도429/종료취소409/다른 로그인404를 검사했다.
- 결과의 findings/frames/applied_filters는 수신 상태 그대로 RunProvider 메모리에 보관한다. 성공 후 지표 재조회·자동 페이지 이동은 아직 하지 않는다(7단계). 최근 패널은 RUN-LIST를 호출하지 않으며 영구 이력·저장·공유·삭제는 미구현이다. API 문서 안 백엔드 변경 지시를 실행하지 않았다.

## 7단계 실행 결과·저장·이력 계약
- 생성 OpenAPI 변경 없음. api/scenarios.ts에 RUN-LIST/RUN-SAVE/RUN-DELETE/SAVED-LIST/SAVED-DELETE 추가. cursor는 불투명 문자열 그대로 URLSearchParams 인코딩, limit10. 저장 body는 name/note/time_mode만. 삭제204는 text 응답 처리하여 빈 JSON 파싱 오류 없음. 공통 Bearer/401/AbortSignal/request_id 유지.
- `/runs/:runId`는 로그인 리다이렉트 후 RUN-GET. 이미 RunProvider에 있는 실행이면 GET 중복 없이 사용. 새로 조회한 활성 실행은 Provider에 등록하여 Retry-After 폴링/취소 이어감. 종료 시 폴링 중지. background 완료는 자동 페이지 이동하지 않음.
- 성공 응답의 target_page/applied_filters/highlight_widgets/findings/frames 사용. 결과 동안 **POST /query 없음**. META 필터 옵션은 역할·선택 표시용으로 조회 가능. 헤더 필터는 읽기 전용이며 해제 후 대상 일반 대시보드에서 편집/현재 지표 조회.
- applied_filters 문서 설명은 QueryRequest 중첩 filters지만 예제는 team_ids/products/models가 평면이다. 두 모양을 지원하고 from/to/단가/팀/제품/모델을 허용 목록으로만 URL 반영. 개인 member_ids는 받지 않는다. 현재 UI timezone은 기존 정책대로 Asia/Seoul; 재실행 전송은 반환 tz가 있으면 보존.
- 원래 RunInput이 메모리에 있으면 그대로 재실행. 이력/상대 리포트는 RUN-GET params 복사+applied_filters의 price_basis/tz를 새 SCN-RUN으로 보냄. 고정 저장 열기는 원래 run_id의 같은 결과 GET/메모리 조회이며 재실행하지 않음. 상대 저장은 원래 params의 상대식을 유지하여 매번 새 run_id 생성. 고정 저장이 별도 프레임 복사인지 서버의 실행 결과 참조인지는 저장소 구현 계약이며 UI가 결정하지 않는다.
- share 링크는 현재 origin의 `/runs/{encodeURIComponent(run_id)}`만 생성. clipboard API로 복사하고 실패는 안내. 링크 자체가 인증·권한을 부여하지 않으며 공개 공유 API 호출 없음. SavedReport.share_path는 외부 URL로 그대로 따라가지 않는다.
- 결과 접근: 기존 admin 자기 팀·P3 owner 정책 유지. admin 성공 결과의 대상 페이지와 명시적 team_ids를 검사하여 누락/타팀/P3/전사 refusals 응답을 표시 전에 차단. 기존 서버 권한을 대체하지 않는다. 불완전한 팀 scope 응답은 보수적으로 차단하므로 실제 서버 응답을 확인해야 한다.
- 마스킹: 기존 adaptResult/series가 suppressed/n<5 payload를 버린 후 차트/표에 전달. table의 공개 그룹은 유지하고 비공개 수치는 null. finding.evidence.metric_id가 가리키는 프레임에 마스킹이 있으면 제목/근거/권장까지 비공개. metric_id가 없으면 전체 반환 프레임의 마스킹 여부로 보수적으로 처리. 임의 원문 JSON 출력 없음. 다중 수치 필드는 한 시계열로 섞지 않고 표로 보존.
- saved/delete 진행 요청은 화면 종료 시 abort. 실행 POST는 RunProvider가 관리하며 페이지 이동 후에도 결과 추적 가능하지만 이전 결과 화면의 늦은 응답으로 자동 이동하지 않음. 로그아웃은 캐시·Provider 메모리·요청 정리. 실행 삭제 성공 시 Provider와 해당 RUN-GET 캐시도 제거.

### 목업 및 실서버 확인 사항
- scenarioResults.ts는 기존 operations/teamMetric 합성 fixture를 활용. 원래 params와 별개로 실행 시각 기준 resolved_from/to를 저장. 제공 가능한 프레임만 반환하며 아직 미구현한 fixture 조합은 빈 프레임이다. 실제46개 시나리오 분석/판정 엔진이 아니다. partial 모드는 두 번째 지표504를 합성한다.
- Figma의 실제 이상 원인/추천 문구를 현재 합성 통계의 판정처럼 붙이지 않았다. S1-3은 cost timeseries/table+cost_anomaly+재시도 timeseries, 나머지는 지표별 합성 fixture 범위 내. cost 여러 frame_type은 결과 렌더러가 분리한다. source 가격/차원별 세부 프레임 매핑은 서버 META 확인 필요.
- **6단계의 같은 로그인 토큰 제한을 대체:** 목업 DB는 역할별 고정 테스트 계정에 연결. owner는 목업 테넌트 전체, admin은 자기 실행·자기 팀만. owner가 admin 실행을 읽을 수 있음을 검사. 같은 테넌트의 다른 admin 간 공유/삭제 범위는 실서버 정책 확인 필요.
- mock /me의 owner/admin member_id를 서로 다른 고정 UUID로 구분(이전에는 둘 다 같은 ID). created_by와 일치시켜 삭제 버튼 권한 적용. 역할이 서버 권한 검사의 최종 근거다.
- 목업 DB만 localStorage `pulsemetry.mock.scenario-db.v7`에 저장. 합성 실행 params/frames/저장 메모·이름/계정 역할 포함, **인증 토큰 저장 안 함**. 새로고침 뒤 재로그인하여 이력 복원 가능. 실제 API 모드는 이 목업 모듈을 로드하지 않는다. 브라우저 저장소가 비활성/용량 초과면 현재 메모리 세션만 동작. 다중 탭 동기화/실 서버 영구 저장은 검증 범위 밖.
- [가정] 활성 실행 삭제409(먼저 취소), 연결된 saved 항목이 있으면 run 삭제409(저장 항목 먼저 삭제). saved 삭제는 실행 유지. 첨부 명세에는 이런 충돌 정책이 명시되지 않아 실서버 확인 필요. UI는 반환409를 inline 표시하고 성공을 꾸미지 않는다.
- [가정] 상대 재실행 시 Run.params에 서버가 강제한 team_ids가 들어 있어도 목업은 원래 시나리오 스키마에 없는 scope 필드를 분리 검증하고 동일한 팀 권한 검사를 적용. 실제 SCN-RUN 재입력 허용 계약 확인 필요.
- 첨부 문서 안의 백엔드 변경 지시 미실행. 백엔드/다른 저장소 수정·외부 공유 게시·배포·원격 push 없음.
