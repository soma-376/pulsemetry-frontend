# OIDC 로그인 — PROJ-186

## 실행 (기존 DB·A/B/C 시드 보존)

먼저 backend의 [Cognito 실행·회사 설정](../../pulsemetry-backend/docs/cognito-dev.md)을 완료한다.
백엔드 저장소 루트의 별도 터미널에서 실행한다. `local`은 기존 키와 개발 Cognito 설정을 함께 읽는다. 서버 시작은 시드를 실행하거나 기존 회원을 자동 연결하지 않는다.

```sh
export PULSEMETRY_DEV_AUTH_DIR="$PWD/build/dev-auth"
export PULSEMETRY_COGNITO_A_CLIENT_SECRET='<A 앱 클라이언트 Secret>'
export PULSEMETRY_COGNITO_B_CLIENT_SECRET='<B 앱 클라이언트 Secret>'
export PULSEMETRY_USER_AUTH_ALLOWED_REDIRECT_URIS=http://localhost:3000/auth/callback,http://localhost:3107/auth/callback
export PULSEMETRY_OIDC_FAILURE_REDIRECT_URI=http://localhost:3000/auth/callback
./gradlew :apps:enrollment-api:bootRun --args='--spring.profiles.active=local'
# 다른 터미널 (같은 백엔드 루트)
./gradlew :apps:dashboard-api:bootRun --args='--spring.profiles.active=local'
```

client secret은 서버 전용 파일·환경변수로만 주입한다. 프론트에는 전달하지 않는다.
Compose는 V13을 포함한 마이그레이션 후 공개 JSON으로 A·B 회사 OIDC 설정만 자동 시딩한다. 회원 sub는 사전 등록 회원의 최초 SSO에서 연결한다. 기존 연결이 다르면 중단하므로 backend의 [사용자 인증 운영](../../pulsemetry-backend/docs/user-auth-operations.md)을 확인한다. `reset`, `down -v`, 시드 재생성을 하지 않는다.

프론트 루트 `.env.local`:

```dotenv
NEXT_PUBLIC_ENROLLMENT_API_URL=http://localhost:8080
ENROLLMENT_API_URL=http://localhost:8080
DASHBOARD_API_URL=http://localhost:8081
BFF_ORIGIN=http://localhost:3000
BFF_SESSION_KEYS=<openssl rand -hex 32로 생성>
```

```sh
npm run dev
```

`http://localhost:3000/login`에서 `owner@seed-a.example.test`, `admin@seed-a.example.test`, `owner@seed-b.example.test`를 입력한다. **Cognito 화면에서만** 해당 테스트 계정 생성 시 설정한 비밀번호를 입력한다. 프론트 앱에는 공통 암호가 없다.

정확한 등록 주소:

| 설정 주체 | 주소 |
| --- | --- |
| Cognito 개발 app client의 callback URL | `http://localhost:8080/api/v1/auth/oidc/callback/cognito` |
| 백엔드 `user-auth.allowed-redirect-uris` | `http://localhost:3000/auth/callback`, 목 브라우저 테스트용 `http://localhost:3107/auth/callback` |
| 백엔드 `user-auth.allowed-origins` | `http://localhost:3000`, `http://localhost:3107` |
| 백엔드 `oidc.failure-redirect-uri` | `http://localhost:3000/auth/callback` (임시 세션 유실 시 고정 복귀 주소) |

포트/도메인을 바꾸면 Cognito 앱 클라이언트의 callback 설정과 백엔드 허용 주소를 함께 명시적으로 수정한다. 와일드카드는 쓰지 않는다. 회사별 issuer/client ID/Secret 참조는 `tenants`에 저장하고, 실제 Secret은 Enrollment의 환경변수로 주입한다.

## 화면별 계약

### `/login`: 회사 탐색

`POST /api/bff/auth/organizations` → BFF의 `POST /api/v1/auth/organizations`

```json
{ "email": "owner@seed-a.example.test" }
```

```json
{
  "organizations": [
    { "organizationId": "1b59ab21-1788-35e0-bfd7-23baa88a35b4", "organizationName": "시드 A · 정상 사용" }
  ]
}
```

서버는 trim·소문자 정규화한 전체 이메일로 `invited`·`active` 회원·활성 조직·설정된 IdP를 찾는다. sub가 NULL이어도 조회한다. 0개는 빈 배열, 1개는 바로 이동, 복수는 사용자 선택이다. 이것만으로 세션/토큰/회원이 생성되지 않는다. authorize는 입력 이메일의 등록 여부를 다시 확인하고 대상 회원을 서버 세션에 고정한다. 최초 callback은 IdP의 검증 이메일이 대상 회원과 일치할 때만 sub를 저장하고 invited→active로 전환한다. 기존 연결은 동일 sub만 허용한다. 입력 오류400, 제한429, 장애503이며 no-store다. 공개 탐색이므로 회사 소속 노출 가능성이 있다. IP 제한만으로 완전히 방지할 수 없어 운영 모니터링이 필요하다.

`GET /api/v1/auth/oidc/authorize`로 **페이지 이동**한다(fetch가 아니다).

```text
tenant_id=<선택한 organizationId>
login_hint=<정규화한 입력 이메일>
redirect_uri=http://localhost:3000/auth/callback
state=<32바이트 난수의 base64url>
code_challenge=<SHA256(verifier)의 base64url>
code_challenge_method=S256
```

IdP 이동은 `window.location.assign()`으로 이력을 남긴다. callback 처리 후 화면 이동은 `router.replace()`를 사용한다.
프론트는 state와 별도 32바이트 verifier를 생성해 선택 조직·redirect URI·생성 시각과 함께 sessionStorage에 보관(10분)한다. secret과 IdP 토큰은 프론트에 오지 않는다. 백엔드는 IdP 왕복용 state·nonce·PKCE를 따로 관리한다.

### `/auth/callback`: 검증·교환·이동

```text
# 성공
?code=uac_<43자>&state=<원래 frontend state>
# 저장된 요청이 있는 실패
?error=login_cancelled&state=<원래 frontend state>
# 백엔드 임시 세션 유실: 설정된 고정 주소로만 복귀
?error=login_expired
```

state·10분 TTL·복귀 주소·중복 파라미터를 검증한 후에만 교환한다. 임시 정보는 성공/실패 모두 지우고 URL의 code/state도 제거한다. React StrictMode의 중복 실행은 같은 Promise를 공유한다. 새로고침/재진입/실패 시 자동 재교환하지 않고 새 로그인을 요구한다.

브라우저는 `POST /api/bff/auth/token`에 아래 필드와 선택한 `organizationId`를 보낸다. BFF가 `POST /api/v1/auth/token`으로 교환한다(60초·일회용 코드). 아래 토큰 응답은 BFF만 받으며 브라우저에는 `{ user }`와 암호화 HttpOnly 쿠키를 반환한다.

```json
{ "code": "uac_<43자>", "redirect_uri": "http://localhost:3000/auth/callback", "code_verifier": "<보관한 verifier>" }
```

```json
{ "access_token": "<Pulsemetry AT>", "refresh_token": "<Pulsemetry RT>", "token_type": "Bearer", "expires_in": 300 }
```

BFF가 `GET /api/v1/auth/me`, `Authorization: Bearer <AT>`로 확인한다. 새로고침 시 브라우저는 `GET /api/bff/auth/session`으로 사용자 정보만 복원한다.

```json
{ "memberId": "<UUID>", "organizationId": "<선택한 회사 UUID>", "organizationName": "회사", "email": "owner@example.test", "displayName": "관리자", "role": "admin" }
```

회사가 다르거나 role이 admin이 아니면 저장하지 않고 발급받은 세션을 폐기한다. backend owner/admin은 `/me`에서 admin으로 반환한다. 이후 `GET /api/v1/organizations/{id}/onboarding`의 completed가 true면 `/overview`, false면 `/onboarding`으로 간다. 온보딩 조회 실패는 조회만 재시도하며 코드를 다시 교환하지 않는다.

| 오류 | UI 처리 |
| --- | --- |
| login_cancelled | 회사 인증 취소 안내·새 로그인 |
| member_not_allowed | 사전 등록 회원·회사·신원 연결 조건 불일치 안내·관리자 문의 |
| invalid_credentials | 인증 검증 실패·새 로그인 |
| auth_unavailable | IdP/인증 서버 장애·나중에 재시도 |
| login_expired 또는 state 누락/불일치 | 만료/유효하지 않은 요청 안내·교환 금지 |

저장된 안전한 복귀 요청이 있는 인증 실패만 error/state로 리다이렉트한다. 시작 단계의 잘못된 tenant/redirect/입력이나 제한은 백엔드 JSON 4xx/5xx이며 임의 URI로 리다이렉트하지 않는다. 백엔드 임시 세션이 사라진 경우 요청 파라미터를 믿지 않고 고정 failure URI로만 보낸다.

### 공통 API 인증·로그아웃

서비스 토큰은 BFF가 AES-256-GCM 암호화 HttpOnly 쿠키로 보관한다. `pulsemetry.seed-session.v1`은 삭제한다.
업무 API는 `/api/bff/dashboard/api/v1/...`, `/api/bff/enrollment/api/v1/...`로 호출한다.
BFF는 만료 직전 또는 upstream 401에서 갱신하고 동일 RT의 진행 중 Promise와 완료 결과(5초)를 공유한다.
동일 출처 요청은 `X-Pulsemetry-Request: 1`을 사용하며 변경 요청은 Origin도 일치해야 한다.
단일 프로세스·서버 전용 키·운영 제약은 [BFF 운영 안내](bff-auth.md)를 따른다.

브라우저는 `POST /api/bff/auth/logout`을 호출한다. BFF가 backend `/api/v1/auth/logout`으로 세션을 폐기하고 쿠키와 갱신 캐시를 제거한다.
IdP SSO 쿠키는 유지되므로 같은 브라우저의 재로그인은 비밀번호 입력을 생략할 수 있다.
`/api/dev/seed-login`은 삭제했으며 구 서버 비밀번호 API는 410이다.


## 검증

```sh
npm test
npm run lint
npm run build
npm run test:browser:mock -- tests/browser/oidc.spec.ts tests/browser/login-onboarding.spec.ts
npm run test:e2e -- tests/e2e/seed-login.spec.ts tests/e2e/oidc-failure.spec.ts
```

목 테스트는 회사 선택·취소·미등록·인증 장애·state 변조·재진입·단회 교환을 검증한다.
백엔드는 격리 PostgreSQL과 모의 OIDC로 서명·nonce·state·PKCE·미등록·취소·만료·이메일 검증을 검사한다.

### 실제 IdP E2E 준비

현재 개발 Cognito는 A 풀의 owner/admin과 B 풀의 owner, 총 3계정이며 C 풀은 없다. DB에는 회사 설정과 회원 이메일을 준비하고 sub는 최초 로그인에서 연결한다.
사용자가 실제 Cognito 브라우저 로그인 성공을 수동 확인했다. 자동 E2E 전체 통과나 모든 계정·실패 경계 검증을 뜻하지 않는다. 기존 로컬 제공자의 통과 기록도 Cognito 실연동 증거로 사용하지 않는다.

현재 자동 E2E는 단일 `E2E_OIDC_ORIGIN`과 C 계정을 가정한다. 회사별 origin 선택, C 미구성 처리, A 풀에서 B 계정이 IdP 단계에서 거부되는 시나리오를 반영한 뒤 재실행해야 한다. 아래는 현재 테스트 드라이버의 입력 계약이며, 환경변수만 지정하면 전체 묶음이 통과한다는 안내가 아니다.

- `E2E_OIDC_ORIGIN`: 개발 Cognito 로그인 도메인의 정확한 HTTPS origin. issuer URL이 아니라 로그인 화면 주소다.
- `E2E_OIDC_PASSWORDS_JSON`: 테스트 프로세스에만 주입하는 이메일 → 비밀번호 JSON 객체. 기본 비밀번호는 없다. 값은 Git·로그·명령 인자에 넣지 않는다.
- `E2E_OIDC_USERNAME_SELECTOR`, `E2E_OIDC_PASSWORD_SELECTOR`, `E2E_OIDC_SUBMIT_SELECTOR`: 선택 설정. 기본은 각각 보이는 `input[name="username"]`, `input[name="password"]`, `button[type="submit"]`이다. 실제 로그인 테마에 맞춰 확인한다.
- `E2E_OIDC_ERROR_SELECTOR`: 잘못된 비밀번호를 제출한 후 나타나는 오류 요소의 선택자. 비밀번호 실패 테스트에는 필수다.

테스트는 정확한 IdP origin을 확인한 후에만 자격 증명을 입력한다. username/password가 한 화면에 있는
개발 로그인 흐름을 대상으로 하며 MFA·여러 단계 로그인은 별도 드라이버가 필요하다.
목표는 구성된 A/B 계정의 로그인·조회·새로고침·로그아웃·갱신과 타 회사 계정·쿠키 유실·잘못된 암호 검증이다. C 분석 데이터 조회 목표와 C의 실제 로그인 준비 여부는 구분한다.
계정 전환 테스트만 명시한 IdP 도메인 쿠키를 지운다. 앱의 로그아웃 동작은 바꾸지 않는다.

읽기 E2E는 시드 도메인 데이터를 초기화하지 않으나 로그인 세션·인증 제한 이력은 생성한다.
IP 제한을 우회하지 않기 위해 테스트 사이에 20초 간격을 둔다. 다른 로그인과 병행해 429가 나면 Retry-After 후 재시도한다.
검증 범위는 실행한 테스트 결과로 판정하며, 인증 성공만으로 모든 계약·설정 화면의 정상 동작을 주장하지 않는다.
