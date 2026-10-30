# 프론트엔드 이미지 게시와 ECS 자동 배포

[PROJ-242](https://team376.atlassian.net/browse/PROJ-242)는 기존 PROJ-232의 이미지 게시 이후 ECS 자동 배포를 연결한다.
설계는 [허브 ADR 0022](https://github.com/soma-376/docs/blob/main/adr/0022-frontend-ecs-image-delivery.md)를 따른다.

## 실행 조건

`ci.yml`은 lint·typecheck·format·test·build와 ARM64 컨테이너 빌드 검증만 수행한다.
`cd.yml`은 develop/main push에서 같은 커밋의 `ci.yml`을 재사용 워크플로로 호출하고, 모든 검사가 통과한 뒤 이미지를 게시한다.
PR과 수동 검증은 `ci.yml`을 직접 실행한다. push 검증을 두 워크플로가 중복 실행하지 않는다.
해당 GitHub Environment의 `ECS_DEPLOY_ENABLED=true`이면 이어서 자동 배포한다. PR과 workflow_dispatch는 검증만 한다.

| 브랜치  | Environment | ECR 저장소                        | ECS 클러스터·서비스    | 실행 환경     |
| ------- | ----------- | --------------------------------- | ---------------------- | ------------- |
| develop | dev         | soma-376/pulsemetry-frontend-dev  | soma-376-frontend-dev  | EC2 ARM64     |
| main    | prod        | soma-376/pulsemetry-frontend-prod | soma-376-frontend-prod | Fargate ARM64 |

각 Environment의 deployment branch 제한은 dev=`develop`, prod=`main`이다. OIDC 신뢰가 Environment를 기준으로 하므로 이 제한을 반드시 설정한다.
Environment에 required reviewer가 설정되어 있으면 승인 후 진행한다. 승인 없는 자동 배포가 필요하면 해당 Environment 정책을 별도로 검토한다.

## 환경 변수와 비밀 값

각 GitHub Environment의 **Variables**에 등록한다. AWS access key나 BFF 키를 GitHub에 저장하지 않는다.

| 이름                           | 값                                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| AWS_ACCOUNT_ID                 | 대상 AWS 계정 ID                                                                                                  |
| AWS_ECR_PUSH_ROLE_ARN          | bootstrap의 frontend_image_push_roles 출력. 기존 이름을 유지하며 ECR 게시와 환경별 ECS 재배포 권한을 함께 가진다. |
| NEXT_PUBLIC_ENROLLMENT_API_URL | 브라우저가 접근하는 실제 enrollment API HTTPS origin                                                              |
| ECS_DEPLOY_ENABLED             | 최초 설정과 정상 배포 확인 후 정확히 `true`. 미설정/다른 값이면 이미지 게시만 한다.                               |

공개 API 주소는 빌드 시 브라우저 코드에 포함되므로 변경 후 재빌드가 필요하다. DNS·인증서·CORS·로그인 callback도 확인한다.
`ENROLLMENT_API_URL`, `DASHBOARD_API_URL`, `BFF_ORIGIN`은 Terraform 실행 설정이고 `BFF_SESSION_KEYS`는 Secrets Manager에서 ECS 실행 역할이 주입한다.
`.env*`와 로컬 인증 파일은 Docker build context에서 제외한다. BFF 갱신 조율은 프로세스 내부이므로 태스크와 Node 프로세스는 한 개다.

## 최초 활성화 순서

1. infra의 bootstrap 변경을 관리자가 plan 검토 후 적용한다. ECR은 `deploy` 한 태그만 mutable이고 기존 역할에 해당 환경 ECS 갱신·조회 권한이 추가된다.
2. `ECS_DEPLOY_ENABLED`를 비활성으로 유지하고 현재 정상 ARM64 이미지 digest에 `deploy` 태그를 붙인다. 상세 명령은 infra `frontend/README.md`의 전환 절차를 따른다.
3. 환경별 runtime에 `automatic_image_deployment=true`를 넣어 Terraform PR·apply를 진행한다. 최초 runtime에는 도메인·기존 ACM 인증서·백엔드 URL·BFF secret과 dev AMI가 필요하다. prod runtime이 없으면 임의 값으로 생성하지 않는다.
4. Terraform은 task definition의 이미지를 환경별 `:deploy`로 전환한다. EC2의 pull 정책 변경은 인스턴스 교체를 수반한다. ECS 완료, ALB healthy, HTTPS와 로그인 동작을 확인한다.
5. 프론트 CI 변경을 머지하고 해당 Environment에 `ECS_DEPLOY_ENABLED=true`를 설정한다. 다음 해당 브랜치 push 또는 최신 push 실행의 재실행부터 자동 반영된다. workflow_dispatch로는 배포하지 않는다.

## 배포와 실패 판정

커밋 SHA·실행 ID·시도 번호를 조합한 immutable 태그로 먼저 게시한다. 배포 스크립트는 현재 서비스의 실행 태스크 수가 양수인 `desiredCount`와 일치하고 진행 중인 배포가 없으며 `:deploy`를 참조하는지 확인한다.
실제 실행 digest와 기존 `deploy` 태그가 일치해야 새 manifest를 승격한다. 이어서 `ecs update-service --force-new-deployment`를 호출한다.
ECS의 새 deployment가 COMPLETED이고 모든 실행 태스크의 배포 ID·task definition·frontend 컨테이너 digest가 새 배포와 일치해야 성공한다. 배포 도중 desiredCount가 바뀌거나 서로 다른 이미지가 섞이면 실패한다. dev 2개와 prod 1개 모두 서비스의 desiredCount를 기준으로 검증한다. ALB에 연결된 ECS 서비스 완료는 target health를 반영하지만, 로그인 성공을 증명하지는 않는다.

브랜치별 push 실행은 취소 없이 직렬화한다. 게시 직전과 배포 태그 갱신 직전에 HEAD를 다시 검사한다. 이후 새 커밋이 생기면 진행 중 배포를 마치고 다음 실행이 반영한다. GitHub는 대기 실행을 최신 실행으로 교체할 수 있다.

실패·자동 롤백·20분 시간 초과·digest 불일치는 CI 실패다. 자신이 갱신한 `deploy` 태그가 그대로일 때 이전 실행 digest로 복구한다.
태그 복구와 서비스 롤백은 다르다. ECS circuit breaker 및 서비스 events에서 이전 정상 태스크 복구를 확인해야 한다. runner 소실·사람의 취소·외부 태그 변경은 수동 확인 대상이다.

앱 역할에는 환경별 ECR 게시·조회, 해당 ECS 서비스 UpdateService/DescribeServices, 클러스터별 태스크 조회, 서울 리전 task definition 조회만 허용한다.
RegisterTaskDefinition, iam:PassRole, Terraform state, secret 값 조회는 허용하지 않는다. UpdateService 권한 자체는 강제 재배포 외 일부 서비스 필드 변경도 가능하므로 workflow와 환경 보호 규칙을 함께 유지한다.

## 재시도·롤백·인프라 유지보수

- 일반 재시도는 최신 push의 실패 실행을 다시 실행한다. 오래된 커밋은 HEAD 검사로 배포하지 않는다.
- 앱 코드 롤백은 정상 버전으로 되돌리는 revert PR을 해당 브랜치에 머지한다. 새 CI가 다시 빌드·게시·배포한다.
- 긴급 복구는 CD를 비활성화하고 진행 중 실행 종료를 기다린 뒤, 정상 digest의 manifest를 `deploy`로 복원하고 서비스를 강제 재배포한다. ECS 완료와 실제 digest를 검증한 뒤 다시 활성화한다.
- 이미지 digest 고정 모드로 돌아가려면 CD를 끄고 runtime의 `automatic_image_deployment=false`, `image_digest=<정상 digest>`를 Terraform PR로 적용한다.
- Terraform apply 전에는 해당 환경 CD를 비활성화하고 기존 실행이 끝날 때까지 기다린다. 두 저장소의 concurrency는 공유되지 않는다. apply 완료·서비스 정상 확인 후 다시 켠다.
- desired=1, min=0%, max=100%이므로 배포 중 짧은 중단이 있다.

## 로컬 검증

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
```

배포 스크립트 테스트는 AWS를 호출하지 않고 성공·실패·롤백·오래된 HEAD 경로를 검증한다. 실제 AWS IAM, OIDC, ECR push와 ECS 배포 검증을 대체하지 않는다.

Docker ARM64 빌드 검증은 아래처럼 실행한다. 임시 주소 이미지는 게시하지 않는다.

```bash
docker build --platform linux/arm64 \
  --build-arg NEXT_PUBLIC_ENROLLMENT_API_URL=https://enrollment.example.invalid \
  --tag pulsemetry-frontend:validation .
```
