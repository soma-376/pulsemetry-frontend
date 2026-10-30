# 브라우저 RUM

브라우저 Faro SDK → 동일 origin `/api/rum/collect` → 사설 Alloy Faro receiver → Loki → Grafana `Pulsemetry · Browser RUM` 경로다. 기존 서버 OTel과 별도이며 Faro 계측 중 Web Vitals만 사용한다.

## 범위와 해석

- LCP·INP는 밀리초, CLS는 단위 없는 점수다. Chrome에서 먼저 확인한다. 다른 브라우저의 지원 차이로 지표가 빠질 수 있다.
- 사용자·세션 ID, URL 쿼리, 동적 경로 ID, DOM 선택자, 오류·console 로그·트레이스는 전송하지 않는다. Web Vitals의 익명 측정 ID만 남긴다.
- `page.url`은 최초 진입 경로 그룹(`/teams`, `/members` 등)이며 원본 URL이 아니다. SPA 내부 이동을 개별 페이지 LCP로 해석하지 않는다.
- INP는 실제 클릭·키 입력이 있어야 생긴다. CLS·INP는 탭을 숨기거나 떠날 때 보고될 수 있다. INP는 API 요청 완료까지의 시간이 아니다.
- 대시보드 p75·등급 분포는 **수신 보고값** 기준이다. 같은 측정 ID가 갱신되거나 재전송되면 중복 포함될 수 있으며 사용자 수·방문별 최종 p75가 아니다. `reportAllChanges=false`로 중간 보고를 줄인다.
- 데이터가 없으면 정상/0으로 판단하지 않는다. 개발 빌드 결과를 운영 성능 기준으로 사용하지 않는다.

## 실행 설정

기본은 비활성이다. 서버 런타임에서 `RUM_ENABLED=true`, `RUM_ENVIRONMENT=local|dev`, `FARO_COLLECTOR_URL`, `BFF_ORIGIN`을 설정한다. prod는 아직 활성화하지 않는다. 브라우저는 공개 설정 API에서 활성 여부·환경만 읽으며 사설 수집 주소는 전달하지 않는다. NEXT_PUBLIC 빌드 변수가 필요하지 않다.

로컬은 observability Compose의 Alloy `127.0.0.1:14347`을 사용한다. 아래 3107은 비어 있는지 먼저 확인하고 사용한다.

```bash
npm run observability:up
npm run build
PORT=3107 BFF_ORIGIN=http://localhost:3107 RUM_ENABLED=true RUM_ENVIRONMENT=local FARO_COLLECTOR_URL=http://127.0.0.1:14347/collect npm start
```

실행 후 Chrome에서 로그인 화면 또는 앱을 열고 조작한 뒤 다른 탭으로 이동한다. Grafana RUM 대시보드에서 환경 `local`을 선택한다. 자동 검증은 별도 빌드와 임시 포트를 사용한다.

```bash
NEXT_DIST_DIR=.next/rum-validation npm run build -- --webpack
node scripts/test-rum-browser.mjs
```

브라우저 검증은 테스트용 클릭 지연을 만들어 세 지표의 **전송**을 확인한다. 기록된 값은 사용자 성능 측정 결과가 아니다. 테스트는 가짜 수신기에만 보내고 서버·브라우저를 종료한다.

## 전송 경계

서버는 origin 일치, JSON만 허용, 16KiB 스트리밍 본문 제한, 요청당 최대 10개 측정, 세 지표·경로·측정 ID 허용목록을 검증한다. 클라이언트가 보낸 앱 이름·환경은 신뢰하지 않고 서버에서 정한다. 쿠키·인증·Referer 헤더를 수집기로 전달하지 않는다. 관측 요청은 서버 요청 히스토그램에서 제외한다.

프록시는 프로세스당 초당 20개/버스트 40개, Alloy도 전체 초당 20개/버스트 40개 제한을 둔다. 이는 사용자별 제한이나 강력한 봇 방어가 아니다. SDK는 재시도 없이 1회 전송하며 수집기 장애는 화면 기능을 막지 않는다. 수신기는 sourcemap 다운로드와 연결 메타데이터 수집을 끈다.

## 배포

프론트 코드는 먼저 배포해도 환경 변수가 없으면 비활성이다. infra PR은 bootstrap IAM·대시보드 허용목록을 적용한 후 runtime SSM Association·SG·앱 환경변수를 적용한다. 기존 관측 EC2를 교체하지 않고 별도 Faro 컨테이너만 실행한다. 마지막으로 대시보드 배포를 확인한다. 워크플로 실행 순서에 따라 대시보드는 재실행이 필요할 수 있다.

실제 dev에서 전송·Loki 수신·패널을 확인하기 전까지 배포 검증 완료로 간주하지 않는다. 끄려면 앱 환경변수 `RUM_ENABLED=false`로 배포한다. 기본 설정으로 prod 전송을 켜지 않는다.
