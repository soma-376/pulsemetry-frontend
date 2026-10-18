# 프론트엔드 이미지 빌드와 ECR 게시

[PROJ-232](https://team376.atlassian.net/browse/PROJ-232)의 이미지 빌드·게시 부분이다.
digest를 infra PR로 자동 전달하는 작업은 아직 포함하지 않는다.

## 실행 조건

기존 lint·typecheck·format·test·build와 ARM64 컨테이너 빌드를 모두 통과하면
`develop` / `main` push에서 자동 게시한다. PR과 수동 workflow 실행에서는 게시하지 않는다.

| 브랜치    | GitHub Environment | ECR 저장소                          |
| --------- | ------------------ | ----------------------------------- |
| `develop` | `dev`              | `soma-376/pulsemetry-frontend-dev`  |
| `main`    | `prod`             | `soma-376/pulsemetry-frontend-prod` |

각 Environment의 deployment branch 규칙을 dev는 `develop`, prod는 `main`만 허용하도록 설정한다.
운영 Environment에는 required reviewers도 설정한다.

## 환경 변수

각 GitHub Environment에 다음 **Variables**를 등록한다. AWS access key는 저장하지 않는다.

| 이름                             | 값                                                             |
| -------------------------------- | -------------------------------------------------------------- |
| `AWS_ACCOUNT_ID`                 | 대상 AWS 계정 ID                                               |
| `AWS_ECR_PUSH_ROLE_ARN`          | bootstrap의 `frontend_image_push_roles` 출력 중 해당 환경 역할 |
| `NEXT_PUBLIC_ENROLLMENT_API_URL` | 브라우저에서 접근하는 실제 enrollment API의 HTTPS origin       |

공개 API 주소는 Docker build argument로 전달되어 브라우저 코드에 포함된다. 주소 변경 후에는
새 빌드와 배포가 필요하다. HTTP ALB 주소는 HTTPS 프론트의 브라우저 요청에 사용할 수 없으며,
실제 공개 HTTPS 엔드포인트와 CORS·로그인 callback 허용 목록을 확인한다.
워크플로는 URL 형식이나 DNS·인증서·API 연결 성공을 별도로 검사하지 않는다.

`ENROLLMENT_API_URL`, `DASHBOARD_API_URL`, `BFF_ORIGIN`, `BFF_SESSION_KEYS`는
컨테이너 **실행 시점**의 서버 설정이다. 이미지 빌드에는 전달하지 않는다. `.env*`와 로컬 인증 파일은
Docker build context에서 제외한다. 실행 설정은 infra의 기존 runtime·Secrets Manager 입력을 따른다.
현재 BFF의 갱신 조율은 프로세스 내부이므로 Node 프로세스와 ECS 태스크는 한 개를 유지한다.

## 로컬 검증

Docker가 필요하다. 다음 이미지는 검증용이며 배포 후보로 사용하지 않는다.

```bash
docker build --platform linux/arm64 \
  --build-arg NEXT_PUBLIC_ENROLLMENT_API_URL=https://enrollment.example.invalid \
  --tag pulsemetry-frontend:validation .
```

이 명령은 ARM64 이미지 빌드만 확인한다. 컨테이너 기동·HTML·정적 자산 응답과
로그인·백엔드 연동 E2E는 별도로 검증한다.

## 최초 활성화와 배포 전달

1. infra의 PROJ-232 bootstrap 변경을 리뷰하고 관리자가 적용한다. 기존 ECR과 OIDC provider를 재사용하며
   환경별 push 전용 역할을 만든다. 실제 frontend 저장소 OIDC subject 형식을 확인하여 입력한다.
2. 위 GitHub Environments·브랜치 제한·변수를 설정한다. 실제 HTTPS API 주소를 준비한다.
3. 해당 브랜치로 변경을 머지하면 CI 통과 후 이미지를 게시한다. 실패한 실행은 Actions에서 재실행할 수 있다.
4. 성공한 실행의 Summary에 있는 `repository@sha256:...`와 commit SHA를 확인한다.
5. infra의 해당 환경 runtime 이미지 입력에 그 digest를 넣는 PR을 **develop 대상으로** 작성한다.
   runtime 입력이 아직 없다면 도메인·키·백엔드 주소 등 필요한 설정을 준비한 뒤 최초 활성화 PR로 검토한다.
   prod는 infra의 develop → main 승격 절차를 따른다. 이 워크플로는 Terraform/ECS를 실행하지 않는다.

태그는 전체 commit SHA·실행 ID·재시도 번호로 구성한다. 동일 커밋을 재실행해도 새 태그를 사용하므로
ECR의 IMMUTABLE 정책과 충돌하지 않는다. 이미 있는 태그를 덮어쓰거나 `latest`를 갱신하지 않는다.
브랜치별 concurrency와 게시 직전 HEAD 확인으로 오래된 실행을 제외한다. HEAD 확인과 ECR push는
원자적이지 않으므로 게시 중 새 커밋이 생기면 이전 이미지가 남을 수 있다. 배포 PR에서는 반드시
원하는 commit의 digest를 선택한다. 이미지 게시 자체가 실행 중인 서비스를 바꾸지는 않는다.

권한은 해당 환경 ECR의 업로드·manifest·digest 조회와 registry 로그인으로 한정한다.
ECR 생성/삭제, ECS 배포, Terraform 상태 접근, `iam:PassRole`은 부여하지 않는다.
