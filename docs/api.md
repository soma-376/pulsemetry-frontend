# API 기반과 목업 계약

## 계층
- 원본: reference/pulsemetry_api_spec.yaml. `npm run generate:api` → src/api/schema.d.ts. 수동 수정 금지.
- `--default-non-nullable false`로 서버 default가 있는 요청 필드를 필수로 잘못 생성하지 않는다.
- src/api/types.ts: 필요한 OpenAPI 타입 별칭. client.ts: Bearer/JSON/AbortSignal/감사 사유/HTTP 오류·401 처리.
- src/api/frames.ts: 4개 frame_type의 평행 배열을 행 단위 cell로 변환. 필드 labels/meta 유지. 깨진 열 길이/타입은 해당 결과 오류.
- 셀 state는 value/missing/masked/zero-denominator. 0은 유효 값. suppressed 또는 group_size<5인 원래 값은 버린다. 한 그룹이 한 프레임이라는 명세에 따라 suppressed_groups가 있으면 숫자 필드 전체를 보수적으로 가린다.
- React Query 캐시 키: 옵션은 사용자·역할·기간, 위젯은 역할·위젯명·정규화 URL 필터. signal로 이전 요청 취소. 실패 자동 재시도/포커스 재조회 없음. 수동 새로고침과5분 주기만 제공.
- 후속 차트는 위젯마다 `['widget', widgetId, role, serializedFilters]` 쿼리를 사용하고 queries[]에는 해당 위젯의 시리즈만 담는다. 뷰포트 지연 로딩은 차트가 생기는2단계에서 추가한다.

## 실행 모드
- 기본 mock: MSW 브라우저 worker 시작 후 React 렌더. 로그인/ME/META-FILTERS/QRY만 구현.
- `.env.local`: `VITE_API_MODE=real`, `VITE_API_BASE_URL=https://your-api.example/v1` 후 개발 서버 재시작. 이 URL은 예시이며 실제 서버 연결/검증하지 않았다. 서버 CORS가 필요하다.
- real 모드에서는 worker를 시작하지 않으며 실제 요청 실패를 목업으로 대체하지 않는다. 클라이언트 인증 토큰은 저장소에 기록하지 않는다.
- mock 계정: owner@pulsemetry.test / admin@pulsemetry.test, 비밀번호 demo-pulse. 로그인 토큰은 목업 서비스 메모리에1시간 보관. 새로고침하면 클라이언트 토큰이 사라져 재로그인한다.
- 목업 고정 시각2026-09-07T09:44:12Z. 기간 프리셋과 ISO 날짜는 응답 resolved_from/to에 반영. 그 밖의 상대식 정렬/월 단위 정밀 해석은 실제 서버의 책임이며 현 목업은 지원하지 않는다.
- 커버리지 fixture: 결제11/12, 전체32/36. 제품·모델·기간은 요청에 반영되지만 fixture 숫자를 통계 계산하지 않는다. 후속 지표 데이터는 아직 없다. 지원하지 않는 metric_id는400 결과를 반환한다.
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
