# 서버 공통 로거

`src/lib/server/logger.ts`는 Node 서버용 기록 API다. JSON을 stdout/stderr에 쓰므로 OTel이 꺼져 있어도 ECS awslogs 설정으로 CloudWatch에 전달할 수 있다. `src/lib/telemetry/logging.ts`가 연결한 OTel transport는 동일 사건을 Alloy → Loki로 보낸다. 공통 로거는 console bridge를 우회하여 OTel 중복 기록을 막는다. 기존 console 호출 수집은 유지한다.

```ts
logger.warn("bff.request.failed", {
  source: "upstream",
  route: "/api/bff/auth/session",
  status: 429,
  code: "rate_limited",
  upstreamService: "enrollment",
  upstreamStatus: 429,
});
```

이벤트명·code·route는 정적 코드/템플릿을 사용한다. 필드는 허용목록이며 원본 요청·본문·헤더·Error 객체를 넘기지 않는다. 임의 문자열에 포함된 개인정보를 모두 탐지하는 자동 마스킹 도구는 아니다. 활성 trace가 있으면 trace_id와 span_id를 양쪽 출력에 포함한다. 전송 실패가 HTTP 동작을 바꾸지 않으며 배치 전송 중 프로세스가 종료되면 유실될 수 있다.

## BFF 기록 기준

- 세션 갱신 충돌 `session_refresh_required`: INFO. 실제 최종 사용자 실패와 같지 않다.
- 그 밖의 4xx(429·인증 거부 포함): WARN.
- 5xx·통신 실패·예상치 못한 예외: ERROR.
- 최종 실패 응답당 한 번 기록한다. upstream 401 후 갱신으로 복구되면 실패 로그를 남기지 않는다.
- source=upstream은 원격 응답/호출에서 실패가 왔다는 뜻이지 백엔드 코드가 근본 원인이라는 뜻은 아니다.
- 인증 경로는 BFF 정규화 code를 남긴다. 업무 응답은 body stream을 보존하기 위해 본문 오류 코드를 읽지 않으며 code=upstream_http_error로 기록한다.
- 업무 route는 `/api/bff/enrollment/[...path]` 등의 그룹이다. 조직/멤버 ID·쿼리를 남기지 않아 세부 endpoint 분석에는 trace가 추가로 필요하다.
- 예외 원문 메시지·스택은 공통 로거에서 기록하지 않는다. 기존 Next request error/console bridge는 별도 경로이며 이 허용목록이 소급 적용되지 않는다.

## 조회

```logql
{service_name="pulsemetry-frontend", deployment_environment_name="dev"} |= "bff.request.failed"
```

Loki의 structured metadata에서 source, code, status, upstreamService, upstreamStatus를 확인한다. ERROR만 조회하는 기존 AWS 패널에서는 WARN·INFO가 보이지 않으므로 Explore에서 먼저 확인한다. 로컬 서버 패널은 WARN을 포함한다.

CloudWatch는 ECS 태스크의 Logs에서 로그 그룹으로 이동해 JSON level/event/code를 조회한다. 둘은 저장소이며 기록하지 않은 사건을 자동으로 생성하지 않는다. 앱 분석은 Loki, ECS 기동/OTel 장애 진단은 CloudWatch를 권장한다. 이번 변경은 AWS 보관 기간이나 로그 드라이버를 변경하지 않는다.
