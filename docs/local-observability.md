# 로컬 프론트 서버 관측성

## 실행

Node.js 22.15 이상(프로젝트 Docker 이미지는 Node.js 24), npm, 실행 중인 Docker가 필요합니다.
프론트 저장소에서 실행합니다. 기존 `.env.local`의 백엔드 주소와 세션 키 설정은 그대로 사용합니다.

```sh
npm ci
npm run observability:up
npm run dev:otel
```

- 프론트: http://localhost:3000
- Grafana: http://localhost:3300/d/pulsemetry-frontend-local
- OTLP HTTP 수신: http://127.0.0.1:14318

`dev:otel`은 기존 개발 서버와 같은 3000번을 사용합니다. `npm run dev`가 실행 중이면
사용자가 해당 터미널에서 Ctrl+C로 종료한 뒤 `npm run dev:otel`로 다시 실행합니다.
3000번이 사용 중일 때 다른 포트로 자동 이동하지 않도록 포트를 명시했습니다.
`dev:otel`은 `.next/otel`에 별도 개발 빌드를 만들며, 기존 `.env.local`의 `BFF_ORIGIN`을 그대로 사용합니다.
`BFF_ORIGIN=http://localhost:3000`과 백엔드의 `http://localhost:3000/auth/callback` 허용 설정을 유지합니다.
브라우저도 `127.0.0.1` 대신 기존 SSO 주소와 일치하는 `localhost`로 접속합니다.
요청 추적과 메모리 확인은 로그인하지 않고 `/login` 페이지를 열어도 가능합니다.

Grafana는 로컬 익명 조회를 허용하므로 아이디·비밀번호 없이 대시보드를 볼 수 있습니다. 초기 관리자 계정과 로그인 화면은 만들지 않습니다.
공개 배포하지 않으며, Compose의 노출 포트는 127.0.0.1에만 바인딩합니다.
처음 이미지 다운로드 및 시작에는 시간이 걸릴 수 있습니다. `--wait`가 준비 상태를 기다립니다.

## 흐름과 수집 범위

```text
Next.js 서버 + OTel SDK
  → OTLP HTTP/JSON (127.0.0.1:14318)
  → Docker 내부 Grafana Alloy
  → Prometheus(메트릭), Tempo(트레이스), Loki(서버 로그)
  → Grafana
```

통합 `grafana/otel-lgtm` 이미지 대신 **Alloy·Prometheus·Tempo·Loki·Grafana를 각각의 컨테이너로 실행**합니다.
메트릭 저장소는 단일 Prometheus 서버입니다.
Alloy가 OTLP 메트릭을 Prometheus 형식으로 변환해 `prometheus.remote_write`로 전송합니다.
Prometheus의 `--web.enable-remote-write-receiver` 옵션으로 수신을 활성화합니다.
Grafana 데이터 소스와 기존 메트릭 패널은 동일한 `uid: prometheus`를 사용합니다.

- 실제 이미지: `compose.observability.yaml`의 `prometheus.image`
- 보내는 주소: `observability/config.alloy`의 `http://prometheus:9090/api/v1/write`
- 조회 주소: `observability/datasources.yaml`의 `http://prometheus:9090`
- 메트릭·로그 보존: 7일, trace 보존: 3일. 보존 기간은 디스크 사용량 상한이 아닙니다.

Prometheus는 로컬 Docker 볼륨에 데이터를 저장합니다. 이 구성은 로컬 개발용입니다.
Alloy는 수신 데이터의 환경을 `local`로 표시합니다. AWS dev/prod에서 이 endpoint를 사용하지 않습니다.
SDK가 시작된 Node.js 프로세스의 `console.log/info/warn/error/debug`와 Next.js `onRequestError` 오류를 OTLP로 전송합니다.
기존 터미널 출력도 유지합니다. 브라우저 콘솔, SDK 시작 전 로그, 별도 프로세스 및 직접 `stdout/stderr.write()`로 출력한 내용은 이 수집 대상이 아닙니다.

| 항목                      | 이번에 수집하는 내용                                                    | 구현                                   |
| ------------------------- | ----------------------------------------------------------------------- | -------------------------------------- |
| 요청 추적                 | Next.js 서버 요청과 렌더링 등의 소요 시간, Next.js가 기록하는 HTTP 상태 | Next.js 기본 계측 + SDK                |
| 프로세스 메모리           | RSS, heapUsed, heapTotal, external, arrayBuffers                        | `process.memoryUsage()`를 5초마다 관측 |
| 웹 바이탈·브라우저 메모리 | 이번 범위에 포함하지 않음                                               | 추후 브라우저 계측 필요                |
| CSV 처리 시간·행 수       | 이번 범위에 포함하지 않음                                               | 실제 CSV 실행 코드에 추가 필요         |
| 앱 로그                   | 서버 console 출력, Next.js 요청 오류                                    | OTel Logs → Alloy → Loki               |

SDK는 측정 데이터를 모아서 전송하는 앱 내부 라이브러리입니다.
Next.js가 이미 측정하는 요청 추적은 그대로 활용하고, 업무별 지표는 필요한 위치에 추가합니다.
SDK를 설치하는 것만으로 모든 지표가 생기거나 모든 `fetch` 호출이 계측되는 것은 아닙니다.

## 환경 구분

`NODE_ENV`는 Next.js의 개발·운영 빌드 모드입니다. dev 서버도 `next start`로 실행하면 `production`이고,
로컬에서도 운영 빌드로 실행하면 `production`입니다. 따라서 배포 환경 식별에 사용하지 않습니다.

| 환경변수                      | 역할                                            | `dev:otel`의 값                 |
| ----------------------------- | ----------------------------------------------- | ------------------------------- |
| `OTEL_SDK_DISABLED`           | `false`로 명시했을 때만 SDK 실행                | `false`                         |
| `OTEL_DEPLOYMENT_ENVIRONMENT` | 데이터의 발생 환경                              | `local`                         |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | 수집기 기본 주소(`/v1/traces` 등은 코드가 추가) | `http://127.0.0.1:14318`        |
| `OTEL_SERVICE_NAME`           | 서비스 이름                                     | 미지정 시 `pulsemetry-frontend` |

리소스 속성 `deployment.environment.name=local`이 데이터에 붙습니다.
프로세스마다 `service.instance.id`를 생성하므로 재시작하면 그래프의 시계열이 바뀝니다.
관측을 켠 상태에서 환경 이름이나 수신 주소가 없으면 초기화가 실패하여 잘못된 목적지로 전송하는 것을 막습니다.
현재 초기화는 위의 명시적 설정을 사용하며 일반 `OTEL_RESOURCE_ATTRIBUTES` 자동 탐지는 사용하지 않습니다.

## 확인 순서

1. `npm run dev:otel` 실행 후 http://localhost:3000/login 을 엽니다.
2. 10~20초 뒤 Grafana의 **Pulsemetry frontend · Local** 대시보드에서 메모리를 확인합니다.
3. **Explore → Tempo → TraceQL**에서 아래 조건으로 검색합니다.

```traceql
{ resource.service.name = "pulsemetry-frontend" && resource.deployment.environment.name = "local" }
```

요청을 선택하면 각 작업의 소요 시간과 상태를 확인할 수 있습니다. 개발 서버의 최초 컴파일 시간은 운영 요청 성능과 다릅니다.
대시보드 상단에 요청 수·5xx 에러율·응답 시간 p95·Node.js CPU 패널이 있습니다.

- 요청 수: 선택한 기간의 `increase` 추정치입니다. 첫 수집 전 요청은 빠질 수 있고 정수가 아닐 수 있습니다.
- 에러율: 최근 5분 동안 완료된 요청 중 HTTP 5xx의 비율입니다. 4xx는 포함하지 않습니다.
- p95: 최근 5분 요청 시간의 히스토그램 추정치입니다. 요청이 적을 때는 값이 불안정하며, 개발 컴파일 시간도 포함될 수 있습니다.
- CPU: `process.cpuUsage()`의 누적 user+system CPU 초를 전송하고, 최근 1분 `rate`로 계산합니다. 코어 하나를 모두 사용하면 100%이고 여러 스레드가 동작하면 100%를 넘을 수 있습니다.

요청 통계는 Next.js `BaseServer.handleRequest` SERVER span이 끝날 때 한 번씩 기록합니다.
페이지·RSC·API 요청을 포함하므로 방문자 수가 아니며, 정적 파일이나 Next의 해당 계측을 거치지 않는 응답은 빠질 수 있습니다.
렌더링·외부 fetch 같은 자식 span은 중복 집계하지 않습니다. 라벨은 HTTP 메서드와 상태 코드만 추가하며 URL·쿼리·사용자 ID는 넣지 않습니다.
이 방식은 모든 요청 span의 기록이 필요하므로 SDK에 `AlwaysOnSampler`를 명시합니다. trace 샘플링을 도입하기 전에는 요청 메트릭을 별도 계측으로 분리해야 합니다.
메트릭 `frontend.http.server.duration`의 `_count`와 `_bucket`을 활용합니다.
요청이 없는 구간의 에러율·p95는 `No data` 또는 빈 구간이 정상입니다. 코드 적용 후 SDK를 재시작하고 요청을 만든 다음 최소 두 차례 수집을 기다립니다.

CPU와 RSS는 **SDK가 실행되는 Node.js 프로세스** 기준입니다. 로컬에서는 내 컴퓨터의 해당 프로세스,
EC2에서는 해당 EC2에서 실행되는 프로세스를 뜻합니다. 컴퓨터/EC2 전체 CPU나 컨테이너 할당량 대비 사용률은 아닙니다.
EC2 전체는 CloudWatch 또는 호스트 exporter, 컨테이너 전체는 별도의 컨테이너 지표가 필요합니다.
macOS Docker 안의 호스트 exporter를 설치하는 것만으로 Mac 전체 CPU가 측정되지는 않습니다.

메트릭을 직접 조회하려면 **Explore → Prometheus**에서 실행합니다.

```promql
frontend_node_memory_bytes{service_name="pulsemetry-frontend",deployment_environment_name="local"}
```

`heapTotal`은 현재 확보한 힙이며 최대 메모리 한도가 아닙니다. `arrayBuffers`는 `external`에 포함됩니다.
각 항목을 합산하지 마세요. 이 값들은 서버 프로세스 전체 메모리이며 브라우저나 특정 CSV 요청만의 메모리가 아닙니다.
개발 중 GC와 리빌드로 변할 수 있으므로 단일 값만으로 메모리 누수를 판단하지 않습니다.

## 서버 로그와 에러 확인

`dev:otel`을 실행한 서버에서 `console.error("CSV 처리 실패", error)`를 호출하면
터미널 출력과 함께 Loki로 전송됩니다. SDK와 Alloy가 배치 전송하므로 보통 수 초 후 표시됩니다.
대시보드 하단 **Frontend server errors · Loki**는 ERROR/FATAL만 표시하며, 오류가 없으면 `No data`가 정상입니다.
**Explore → Loki**에서는 전체 로그를 조회합니다.

```logql
{service_name="pulsemetry-frontend", deployment_environment_name="local"}
```

에러만 조회하려면 다음 조건을 붙입니다.

```logql
{service_name="pulsemetry-frontend", deployment_environment_name="local"} | severity_text=~"ERROR|FATAL"
```

로그를 펼치면 `exception_stacktrace`, `log_source` 등의 메타데이터가 보입니다.
활성 trace 안에서 기록된 로그에는 `trace_id`도 들어가므로 Tempo에서 같은 ID를 검색할 수 있습니다.
Next.js 요청 오류는 `log_source=next.request`, 콘솔 로그는 `log_source=console`입니다.
같은 오류가 Next.js 훅과 콘솔 양쪽에 기록될 수 있으며 두 기록의 출처로 구분합니다.
HTTP 4xx/5xx 응답을 직접 반환하는 것만으로 에러 로그가 생기지는 않습니다.

요청 오류 훅은 헤더·쿠키·본문·쿼리 문자열을 자동 수집하지 않습니다.
console에 전달한 내용과 오류 메시지·스택은 전송되므로 토큰이나 개인정보를 출력하지 않습니다.
SDK 비활성화 시 콘솔 수집도 비활성화됩니다. 코드 적용 후 기존 개발 서버는 다시 실행해야 합니다.
로그 큐는 최대 2,048개이며, 장시간 전송 실패나 강제 종료 시 로그가 유실될 수 있습니다.

## 종료와 문제 확인

프론트 터미널에서 Ctrl+C를 누른 뒤 관측 스택을 종료합니다.

```sh
npm run observability:down
```

로컬 수집 데이터는 서비스별 Docker 전용 볼륨(`prometheus-data`, `tempo-data`, `loki-data`, `grafana-data`, `alloy-data`)에 남습니다. 초기화가 필요할 때만 다음 명령을 사용합니다.

```sh
docker compose -f compose.observability.yaml down -v
```

데이터가 없으면 프론트의 계측 활성화 여부, 요청 발생 여부, Grafana 시간 범위와 수신기 로그를 확인합니다.

```sh
docker compose -f compose.observability.yaml ps
docker compose -f compose.observability.yaml logs --tail=80 alloy prometheus tempo grafana
```

배치는 메모리에 있으므로 강제 종료 시 마지막 미전송 로그·트레이스가 유실될 수 있습니다.
운영 적용 시에는 종료 시 flush, 샘플링, 민감한 URL/속성 처리, 네트워크·인증과 보존 정책을 별도로 준비합니다.

## 이전 로컬 관측성 데이터

Mimir 컨테이너는 제거하고 Prometheus를 새 볼륨에서 실행합니다.
기존 `pulsemetry-frontend-observability_mimir-data` 볼륨은 보존하며 자동으로 이관하지 않습니다.
대시보드에는 전환 후 Prometheus가 수신한 데이터부터 표시됩니다.
Compose의 `down -v`는 현재 구성의 볼륨을 삭제하며, 구성에서 빠진 과거 Mimir 볼륨은 삭제하지 않습니다.

이전 통합 컨테이너 `pulsemetry-frontend-observability-lgtm-1`는 정지 상태로,
`pulsemetry-frontend-observability_lgtm-data` 볼륨도 보존합니다.
Compose가 이 컨테이너를 orphan으로 알릴 수 있지만 새 스택의 동작에는 영향을 주지 않습니다.

## 검증 범위

로컬 검증은 별도 포트에서 실행한 실제 Next.js의 `/login` 요청과 SDK 메모리 전송을 사용합니다.
검증용 프론트는 확인 후 종료하며, 사용자의 3000번 서버를 종료하거나 설정을 바꾸지 않습니다.
3000번 서버가 일반 `npm run dev`로 실행 중이라면 사용자가 `npm run dev:otel`로 다시 실행해야 지속적으로 데이터가 들어옵니다.
AWS 인프라 적용과 Git push는 수행하지 않습니다.

공식 문서: [Next.js OpenTelemetry](https://nextjs.org/docs/app/guides/open-telemetry),
[Prometheus remote write 수신](https://prometheus.io/docs/prometheus/latest/querying/api/#remote-write-receiver).
