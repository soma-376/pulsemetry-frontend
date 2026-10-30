import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const digestPattern = /^sha256:[a-f0-9]{64}$/;

export function deploymentConfig(env) {
  const environment =
    env.GITHUB_REF_NAME === "develop"
      ? "dev"
      : env.GITHUB_REF_NAME === "main"
        ? "prod"
        : null;
  if (
    !environment ||
    env.GITHUB_EVENT_NAME !== "push" ||
    env.GITHUB_REPOSITORY !== "soma-376/pulsemetry-frontend" ||
    !/^\d{12}$/.test(env.AWS_ACCOUNT_ID ?? "") ||
    !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? "") ||
    !digestPattern.test(env.IMAGE_DIGEST ?? "")
  ) {
    throw new Error(
      "배포 브랜치·이벤트·저장소·계정·SHA·digest 입력이 올바르지 않습니다.",
    );
  }
  const repository = `soma-376/pulsemetry-frontend-${environment}`;
  return {
    environment,
    repository,
    service: `soma-376-frontend-${environment}`,
    image: `${env.AWS_ACCOUNT_ID}.dkr.ecr.ap-northeast-2.amazonaws.com/${repository}:deploy`,
    sha: env.GITHUB_SHA,
    digest: env.IMAGE_DIGEST,
  };
}

function primary(service) {
  return service.deployments?.find(
    (deployment) => deployment.status === "PRIMARY",
  );
}

function stable(service) {
  return (
    service.status === "ACTIVE" &&
    Number.isInteger(service.desiredCount) &&
    service.desiredCount > 0 &&
    service.runningCount === service.desiredCount &&
    service.pendingCount === 0 &&
    service.deployments?.length === 1 &&
    primary(service)?.rolloutState === "COMPLETED"
  );
}

// AWS·GitHub I/O를 주입하여 롤백/경합/지연 응답을 실제 리소스 변경 없이 검증한다.
export async function deployImage({
  config,
  aws,
  headSha,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  summary = console.log,
  timeoutMs = 20 * 60 * 1000,
}) {
  const { service, repository, digest, image, sha } = config;
  const serviceArgs = ["--cluster", service, "--services", service];
  const describeService = () => {
    const result = aws("ecs", "describe-services", serviceArgs);
    if (result.failures?.length || result.services?.length !== 1) {
      throw new Error(
        "ECS 서비스가 없습니다. 해당 환경의 최초 Terraform 배포를 먼저 완료하세요.",
      );
    }
    return result.services[0];
  };
  const runningTasksDigest = (definition, deploymentId, desiredCount) => {
    const { taskArns } = aws("ecs", "list-tasks", [
      "--cluster",
      service,
      "--service-name",
      service,
      "--desired-status",
      "RUNNING",
    ]);
    if (
      taskArns?.length !== desiredCount ||
      new Set(taskArns).size !== desiredCount
    )
      throw new Error("실행 중 태스크 수가 desiredCount와 일치하지 않습니다.");
    const tasks = [];
    // DescribeTasks는 호출당 최대 100개를 허용한다.
    for (let offset = 0; offset < taskArns.length; offset += 100) {
      const batch = taskArns.slice(offset, offset + 100);
      const result = aws("ecs", "describe-tasks", [
        "--cluster",
        service,
        "--tasks",
        ...batch,
      ]);
      if (result.failures?.length || result.tasks?.length !== batch.length)
        throw new Error("실행 태스크 전체를 조회하지 못했습니다.");
      tasks.push(...result.tasks);
    }
    const seen = new Set();
    const digests = new Set();
    for (const task of tasks) {
      const container = task.containers?.find(
        (item) => item.name === "frontend",
      );
      if (
        !taskArns.includes(task.taskArn) ||
        seen.has(task.taskArn) ||
        task.lastStatus !== "RUNNING" ||
        task.taskDefinitionArn !== definition ||
        task.startedBy !== deploymentId ||
        container?.lastStatus !== "RUNNING" ||
        !digestPattern.test(container?.imageDigest ?? "")
      )
        throw new Error(
          "실제 태스크의 배포 ID·정의·상태·이미지 digest를 확인하지 못했습니다.",
        );
      seen.add(task.taskArn);
      digests.add(container.imageDigest);
    }
    if (digests.size !== 1)
      throw new Error("실행 태스크들의 이미지 digest가 서로 다릅니다.");
    return [...digests][0];
  };
  const manifestFor = (imageDigest) => {
    const result = aws("ecr", "batch-get-image", [
      "--repository-name",
      repository,
      "--image-ids",
      `imageDigest=${imageDigest}`,
    ]);
    const entry = result.images?.[0];
    if (
      result.failures?.length ||
      !entry?.imageManifest ||
      result.images.some(
        (item) =>
          item.imageId?.imageDigest !== imageDigest ||
          item.imageManifest !== entry.imageManifest,
      )
    ) {
      throw new Error(`ECR manifest를 확인하지 못했습니다: ${imageDigest}`);
    }
    return entry;
  };
  const putTag = (entry) => {
    const result = aws("ecr", "put-image", [
      "--repository-name",
      repository,
      "--image-tag",
      "deploy",
      "--image-manifest",
      entry.imageManifest,
      ...(entry.imageManifestMediaType
        ? ["--image-manifest-media-type", entry.imageManifestMediaType]
        : []),
    ]);
    if (result.image?.imageId?.imageDigest !== entry.imageId.imageDigest) {
      throw new Error("ECR 배포 태그의 digest가 요청한 이미지와 다릅니다.");
    }
  };
  const tagDigest = () => {
    const result = aws("ecr", "describe-images", [
      "--repository-name",
      repository,
      "--image-ids",
      "imageTag=deploy",
    ]);
    return result.imageDetails?.[0]?.imageDigest;
  };

  if (headSha() !== sha) {
    summary("브랜치가 변경되어 이전 커밋의 ECS 배포를 건너뜁니다.");
    return { skipped: true };
  }
  const before = describeService();
  if (!stable(before))
    throw new Error(
      "ECS 실행 수가 desiredCount와 다르거나 다른 배포가 진행 중입니다.",
    );
  const definition = before.taskDefinition;
  const desiredCount = before.desiredCount;
  const { taskDefinition } = aws("ecs", "describe-task-definition", [
    "--task-definition",
    definition,
  ]);
  const container = taskDefinition?.containerDefinitions?.find(
    (item) => item.name === "frontend",
  );
  if (
    container?.image !== image ||
    container.versionConsistency !== "enabled"
  ) {
    throw new Error(
      "Terraform의 automatic_image_deployment 전환이 필요합니다. 예상 이미지: " +
        image,
    );
  }
  const previousDigest = runningTasksDigest(
    definition,
    primary(before).id,
    desiredCount,
  );
  // 태그가 아니라 실제 실행 버전을 복구 기준으로 삼는다.
  const previousManifest = manifestFor(previousDigest);
  const newManifest = manifestFor(digest);
  if (tagDigest() !== previousDigest) {
    throw new Error(
      "deploy 태그와 실행 이미지가 다릅니다. 이전 실패 또는 수동 변경을 먼저 복구하세요.",
    );
  }
  if (headSha() !== sha) {
    summary("배포 준비 중 브랜치가 변경되어 태그 갱신을 건너뜁니다.");
    return { skipped: true };
  }
  const current = describeService();
  if (
    !stable(current) ||
    primary(current).id !== primary(before).id ||
    current.taskDefinition !== definition ||
    current.desiredCount !== desiredCount
  ) {
    throw new Error(
      "배포 준비 중 ECS 서비스가 변경되었습니다. 인프라 apply와 동시에 실행하지 마세요.",
    );
  }

  let promotionAttempted = false;
  try {
    if (digest !== previousDigest) {
      promotionAttempted = true;
      putTag(newManifest);
    }
    const { service: updated } = aws("ecs", "update-service", [
      "--cluster",
      service,
      "--service",
      service,
      "--force-new-deployment",
    ]);
    const deploymentId = primary(updated)?.id;
    if (!deploymentId || deploymentId === primary(before).id)
      throw new Error("새 ECS deployment ID가 생성되지 않았습니다.");
    summary(
      `배포 시작: ${config.environment}, commit ${sha}, digest ${digest}, deployment ${deploymentId}`,
    );
    const started = now();
    while (now() - started < timeoutMs) {
      const state = describeService();
      const deployment = state.deployments?.find(
        (item) => item.id === deploymentId,
      );
      if (deployment?.rolloutState === "FAILED") {
        throw new Error(
          "새 ECS 배포가 실패했습니다: " +
            (deployment.rolloutStateReason ?? deploymentId),
        );
      }
      if (
        state.taskDefinition !== definition ||
        state.desiredCount !== desiredCount ||
        (primary(state)?.id !== deploymentId && now() - started >= 60000)
      ) {
        throw new Error(
          "다른 ECS 배포로 전환되었거나 이전 버전으로 롤백되었습니다.",
        );
      }
      if (primary(state)?.id === deploymentId && stable(state)) {
        const actualDigest = runningTasksDigest(
          definition,
          deploymentId,
          desiredCount,
        );
        if (actualDigest !== digest)
          throw new Error(
            `실행 이미지 불일치: 기대 ${digest}, 실제 ${actualDigest}`,
          );
        if (tagDigest() !== digest)
          throw new Error("배포 중 deploy 태그가 외부에서 변경되었습니다.");
        summary(`배포 완료: ${deploymentId}, 실행 digest ${actualDigest}`);
        return { deploymentId, digest: actualDigest };
      }
      await sleep(15000);
    }
    throw new Error(
      "ECS 배포가 제한 시간 내 완료되지 않았습니다. 서비스 events와 ALB target health를 확인하세요.",
    );
  } catch (error) {
    if (promotionAttempted) {
      try {
        if (tagDigest() === digest) {
          putTag(previousManifest);
          summary(
            `deploy 태그를 이전 실행 digest ${previousDigest}로 복구했습니다. 서비스 롤백 완료 여부는 별도로 확인하세요.`,
          );
        } else {
          summary(
            "deploy 태그가 외부에서 변경되어 자동 복구하지 않았습니다. 서비스와 태그를 확인하세요.",
          );
        }
      } catch (recoveryError) {
        summary(
          `배포 태그 복구도 실패했습니다. 수동 복구 필요: ${recoveryError.message}`,
        );
      }
    }
    throw error;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const executeJson = (command, args) =>
    JSON.parse(
      execFileSync(command, args, {
        encoding: "utf8",
        timeout: 60000,
        maxBuffer: 4 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  try {
    await deployImage({
      config: deploymentConfig(process.env),
      aws: (service, operation, args) =>
        executeJson("aws", [
          service,
          operation,
          ...args,
          "--region",
          "ap-northeast-2",
          "--output",
          "json",
          "--no-cli-pager",
        ]),
      headSha: () =>
        executeJson("gh", [
          "api",
          `repos/${process.env.GITHUB_REPOSITORY}/git/ref/heads/${process.env.GITHUB_REF_NAME}`,
        ]).object.sha,
      summary: (message) => {
        console.log(message);
        if (process.env.GITHUB_STEP_SUMMARY)
          appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${message}\n`);
      },
    });
  } catch (error) {
    // execFileSync의 오류 객체에는 전체 명령 인수가 있으므로 객체 자체는 출력하지 않는다.
    console.error(error.stderr?.toString() || error.message);
    process.exitCode = 1;
  }
}
