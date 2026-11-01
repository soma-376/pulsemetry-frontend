# BFF 공유 세션

웹 세션 정책은 [허브 ADR 0030](../../docs/adr/0030-shared-valkey-web-sessions.md)를 따른다. backend 인증·인가와 RT 재사용 폐기는 유지한다.

## 저장 형식과 수명

키는 `dev:bff:session:<uuid>` 또는 `prod:bff:session:<uuid>`다. JSON 값은 schemaVersion=1, revision, sessionExpiresAt, encryptedSession, refresh를 가진다. encryptedSession에는 기존 Session 필드(id·organizationId·AT·RT·만료)를 AES-256-GCM으로 암호화해 넣는다. 키는 BFF_SESSION_KEYS에서 환경·목적을 분리해 파생하며 origin도 인증한다. refresh는 null 또는 owner·startedAt이다. 별도 락 키·사용자별 인덱스는 두지 않는다.

로그인마다 새 UUID를 발급하고 세션은 최초 로그인 기준 30일에 PXAT로 만료한다. 갱신은 TTL을 연장하지 않는다. 브라우저에는 v2 암호화 식별자·만료 시각만 저장한다. 갱신 응답은 Set-Cookie를 쓰지 않는다.

Lua는 GET으로 읽었던 전체 값의 일치 여부를 확인해 조건부 변경/삭제한다. 단일 키만 사용하므로 클러스터 slot 간 트랜잭션은 필요 없다. 로그아웃은 GET+DEL을 원자적으로 수행한 뒤 backend 폐기를 요청한다. 늦은 갱신 완료는 이미 삭제된 키를 다시 만들지 않고 받은 RT를 폐기한다.

## 실패 정책

- 정상 갱신: 다른 요청은 100~149ms 간격으로 최대 12초 기다린다. 대기 한도는 503이며 담당자 재선정이나 기존 RT 재제출은 하지 않는다.
- 20초 이상 남은 refreshing: 담당 프로세스가 중단된 것으로 보고 조건부 삭제 후 401로 재로그인을 요구한다.
- backend refresh 실패/응답 유실: 세션을 조건부 삭제하고 401. 삭제가 불가능하면 refreshing을 남겨 후속 갱신을 막는다.
- Valkey 연결/명령 실패: 503. 브라우저 쿠키를 삭제하거나 프로세스 메모리 방식으로 우회하지 않는다.
- 키 부재·만료·손상: 401. 로그인 폼은 세션 확인 장애에도 접근할 수 있다.
- Valkey 비동기 복제 장애 조치 시 쓰기 유실 가능성은 남는다. 분산 트랜잭션이나 모든 장애에서 정확히 한 번 처리를 보장하지 않는다.

## 실행 설정

Valkey가 유일한 세션 저장소이며 다음 값이 모두 필요하다. 환경 설정 누락/오류는 실패한다.

```dotenv
BFF_SESSION_ENV=dev
BFF_VALKEY_HOST=<shared 출력 cache.endpoint의 address>
BFF_VALKEY_CACHE_NAME=pulsemetry-frontend-shared
BFF_VALKEY_USERNAME=pulsemetry-bff-dev
AWS_REGION=ap-northeast-2
```

BFF_ORIGIN과 BFF_SESSION_KEYS는 기존 설정을 유지한다. prod는 ENV와 USERNAME을 prod로 바꾼다. 네트워크는 사설 TLS 6379, 자격증명은 환경별 ECS task role이다. SDK 기본 자격증명 체인을 사용하고, 15분 IAM 토큰을 연결마다 만들며 10분마다 재인증한다. 읽기는 primary만 사용하고 offline 명령 대기를 끈다. 연결 최대 5초·명령 2초·명령 큐 500개로 제한한다. 토큰·명령 인자·연결 오류 원문은 로그에 출력하지 않는다.

인프라 `runtime.valkey={host,cache_name}` 입력이 환경변수와 전용 task role을 연결한다. 해당 역할의 PassRole은 bootstrap에서 허용한다. ECS execution role과 task role은 다르다.

## 전환

Valkey와 ACL·피어링 준비 → bootstrap PassRole 반영 → 이 버전의 BFF 이미지 준비 → 환경별 runtime.valkey 연결 순서로 적용한다. v1 쿠키는 자동 이관하지 않고 재로그인한다. 전환 중 로그인 트래픽을 제한하고 이전 버전 태스크를 drain해 두 버전이 사용자 요청을 혼합 처리하지 않게 한다. 롤백 시에도 재로그인이 필요하다.

현재 상태: 토큰 쿠키와 프로세스 메모리 갱신 캐시는 제거했다. 실제 endpoint 입력·AWS apply·IAM/TLS/ACL 실검증은 별도다. 로컬 개발은 사설 endpoint 접근 경로와 dev 역할 자격증명이 필요하다.

## 검증

`node --import tsx --test tests/valkey-session.test.ts`로 두 BFF 조율·실패 정책·쿠키/환경 격리를 확인한다. 전용 로컬 Valkey를 시작한 뒤 `VALKEY_TEST_PORT=16389 node --import tsx tests/valkey.integration.ts`로 실제 Lua의 20개 동시 요청·TTL·삭제 경쟁을 확인한다. 통합 테스트는 localhost 전용이며 기본 6379 포트를 사용하지 않는다.
