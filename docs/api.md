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
