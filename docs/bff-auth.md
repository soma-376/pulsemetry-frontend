# 웹 인증 BFF 운영

서비스 토큰은 브라우저 JavaScript에 전달하지 않는다. Next.js의 `/api/bff/[...path]`가 코드 교환·사용자 확인·API 프록시·갱신·폐기를 수행한다. 상태 없는 쿠키 암복호화는 `src/lib/server/session-cookie.ts`, 토큰 갱신과 API 처리는 `src/lib/server/bff.ts`, 클라이언트 사용자 캐시는 `src/lib/api/session.ts`다.

## 환경과 배포

- `BFF_ORIGIN`: 브라우저의 정확한 origin. 운영 HTTPS, 로컬 loopback HTTP만 허용한다.
- `BFF_SESSION_KEYS`: `openssl rand -hex 32`로 생성한 64자리 hex 키. 현재 키,이전 키 순서로 최대 3개. 서버 시크릿으로 주입한다. 공개 환경변수·로그·Git에 넣지 않는다.
- `ENROLLMENT_API_URL`, `DASHBOARD_API_URL`: 서버에서 접근할 고정 HTTP(S) origin. URL path·사용자 정보·query를 허용하지 않는다.
- `NEXT_PUBLIC_ENROLLMENT_API_URL`: 브라우저 OIDC authorize 이동용 공개 주소. 업무 API에는 사용하지 않는다.
- Node.js 프로세스 하나에서 실행한다. worker·replica·serverless·롤링 배포의 겹친 프로세스는 갱신 캐시를 공유하지 않는다. 증설 전 공유 조율 설계가 필요하다.
- 키는 재시작해도 유지한다. 교체는 새 키를 맨 앞에 추가하고 이전 키를 세션 수명 동안 유지하거나 재로그인을 정책적으로 요구한다.

운영 쿠키는 `__Host-pulsemetry-session`, HttpOnly·Secure·SameSite=Lax·Path=/이며 Domain은 없다. HTTP 로컬 개발만 `pulsemetry-session`과 Secure 미설정을 사용한다. 쿠키에는 AES-256-GCM으로 토큰·조직·세션 UUID·AT 만료·세션 절대 만료를 인증 암호화한다. 키 식별자와 버전을 포함하며 origin을 인증 데이터에 묶는다. 3800자 초과를 거부하고 세션 30일 수명을 갱신으로 연장하지 않는다.

## 요청 경계

모든 BFF 호출은 `X-Pulsemetry-Request: 1`을 요구한다. Origin이 있으면 고정 origin과 일치해야 하고 변경 요청은 Origin이 필수다. cross-site 요청은 거부하고 CORS를 열지 않는다. 프록시는 조직 API·카탈로그만 허용하며 요청의 Cookie·Authorization·전달 헤더는 버린다. backend redirect와 Set-Cookie를 전달하지 않는다. 응답은 no-store다.

backend는 최종 권한·세션 검증을 유지한다. BFF는 사용자 JWT를 자체 인가 근거로 삼지 않는다. 동일 출처의 XSS는 쿠키를 읽을 수 없지만 피해자 브라우저로 요청할 수 있으므로 XSS 방어는 별도 유지한다.

## 갱신과 실패

같은 RT 해시의 진행 중 Promise를 공유한다. 완료 결과는 5초 보관하며 1000개 상한과 자동 제거를 적용한다. 상한에 도달하면 기존 작업을 축출하지 않고 503을 반환한다. 네트워크 요청은 10초 제한이고 실패 작업은 제거한다. 갱신이 있었던 응답만 쿠키를 교체한다. 일반 응답과 늦은 인증 오류는 기존 쿠키를 덮어쓰거나 삭제하지 않는다.

프로세스 재시작·응답 유실·5초 밖 지연·장시간 응답 재정렬은 재로그인이 필요할 수 있다. 이 구성은 임의의 네트워크 지연에서 세션 유지를 보장하지 않는다. 로그아웃은 서버 폐기를 먼저 확인하며 실패하면 재시도 오류를 반환한다. 오래된 응답이 쿠키를 복구하더라도 backend에서 폐기한 세션은 사용하지 못한다.

## 화면 접근 제어

`src/proxy.ts`는 루트·대시보드·온보딩 경로와 하위 경로의 쿠키 무결성·세션 절대 만료만 검사한다. 유효하지 않으면 렌더링 전에 `/login`으로 보낸다. AT 만료는 통과시키며 backend 호출·갱신·갱신 캐시 참조는 하지 않는다. Proxy와 BFF 사이의 전역 메모리 공유를 전제로 하지 않는다.

`src/components/auth/RouteGuard.tsx`는 로그인 페이지, 대시보드·온보딩 레이아웃, 루트 페이지에 연결된다. 최초 접근·경로 변경·창 포커스 복귀·브라우저 뒤로가기 캐시(BFCache) 복원마다 BFF 세션을 확인하고, 동일 브라우저 문서의 동시 확인은 `src/lib/api/session.ts`의 Promise를 공유한다. BFF가 AT를 갱신할 수 있으면 로그인 상태로 인정한다. 이후 조직별 기존 온보딩 쿼리를 다시 조회해 목적지를 정한다.

| 경로 | 미로그인 | 온보딩 미완료 | 온보딩 완료 |
| --- | --- | --- | --- |
| `/login` | 로그인 폼 | `/onboarding` | `/overview` |
| `/onboarding` 및 하위 | `/login` | 접근 허용 | `/overview` |
| `/overview`, `/teams`, `/members`, `/settings`, `/ops` 및 하위 | `/login` | `/onboarding` | 접근 허용 |
| `/` | `/login` | `/onboarding` | `/overview` |
| `/contact`, `/auth/callback` | 접근 허용 | 접근 허용 | 접근 허용 |

OIDC 시작은 `location.assign()`으로 로그인 기록을 유지하며 회사 인증 화면으로 이동한다. 콜백 완료는 `router.replace()`로 목적지에 이동한다. 뒤로가기로 로그인 기록에 돌아오거나 BFCache에서 복원되면 현재 쿠키로 다시 확인한다. 복원 전의 진행 중 요청과 늦은 응답은 재사용하지 않는다.

로그인 페이지는 쿠키 존재만으로 Proxy에서 이동시키지 않는다. 실제 세션 확인 후 클라이언트 `router.replace()`로 이동하므로 폐기된 쿠키가 남아 있어도 로그인 화면과 보호 화면을 순환하지 않는다. 온보딩 완료 응답으로 같은 쿼리 캐시를 갱신하고 `/overview`로 이동한다. API와 정적 파일은 Proxy matcher에 포함하지 않는다.

클라이언트 인증 상태는 확인 중·로그인·미로그인·확인 실패로 구분한다. 확인 전에는 로그인 폼과 보호 화면을 숨기고 공통 로딩 UI를 보여준다. 포커스 재확인 중에는 기존 컴포넌트를 숨긴 채 유지하여 작성 중인 입력을 보존한다. 401·익명 응답은 사용자 정보와 조직 쿼리 캐시를 정리하고 로그인으로 이동한다. 403은 권한 안내, 네트워크 오류·429·5xx는 재시도를 표시한다. 오류 응답만으로 쿠키를 삭제하지 않는다. 다른 탭에서 로그아웃하면 다음 포커스 복귀·경로 이동·API 401에서 감지한다.

이 가드는 화면 표시와 이동을 제어한다. 데이터 접근 보안 경계는 BFF와 backend다. 클라이언트 가드로 감싼다고 하위 Server Component의 실행이나 RSC payload 전송을 막을 수는 없다. 서버에서 민감한 데이터를 렌더링하는 경우 해당 서버 조회 지점에도 인증 검증을 적용해야 한다.

## 인증 요청 제한

현재 backend는 `/api/v1/auth/*`를 remoteAddr 기준 분당 30회 제한한다. BFF가 호출하면 여러 사용자의 요청이 BFF 주소 하나로 합쳐진다. 이 제한을 우회하기 위해 브라우저의 X-Forwarded-For를 그대로 전달하지 않는다. 운영 동시 사용자 규모에 맞춘 backend의 신뢰 프록시/IP 또는 사용자별 제한 정책은 별도로 조정해야 한다. 작은 규모에서도 429가 발생하면 잠시 후 재시도한다.

## 검증

`node --import tsx --test tests/*.test.ts`, `npm run lint`, `npm run build`를 실행한다. `tests/bff.test.ts`는 쿠키·CSRF·프록시·동시 갱신·유예·포화·로그아웃·타임아웃을 검증한다. `tests/browser/bff-cookie.spec.ts`는 실제 Next 서버와 테스트 전용 upstream으로 HttpOnly 및 다중 탭 갱신을 검증한다. `tests/route-access.test.ts`와 `tests/session-state.test.ts`는 경로 정책·쿠키 검사·동시 확인·오류 상태·로그아웃 경합을 검증한다. `tests/browser/route-access.spec.ts`는 실제 Proxy와 테스트 키로 암호화한 쿠키를 사용해 직접 접근·새로고침·클라이언트 이동·포커스·오류 재시도를 검사한다. 운영 코드에는 테스트 인증 우회가 없다. 실제 IdP·Spring 연결은 `tests/e2e`에서 별도로 검증한다.

로그인에서 조회한 이메일은 회사 선택 후에도 `login_hint`로 enrollment authorize에 전달한다. 백엔드는 이를 IdP 인증 요청에 추가한다. 지원하는 IdP가 입력란을 채우는 용도이며 신원 검증에는 사용하지 않는다. 이메일 힌트를 OIDC callback 임시 정보에 별도로 저장하지 않는다.
