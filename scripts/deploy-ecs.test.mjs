import assert from "node:assert/strict";
import test from "node:test";
import { deployImage, deploymentConfig } from "./deploy-ecs.mjs";

const oldDigest = `sha256:${"a".repeat(64)}`;
const newDigest = `sha256:${"b".repeat(64)}`;
const sha = "c".repeat(40);
const env = {
  GITHUB_EVENT_NAME: "push",
  GITHUB_REF_NAME: "develop",
  GITHUB_REPOSITORY: "soma-376/pulsemetry-frontend",
  AWS_ACCOUNT_ID: "111111111111",
  GITHUB_SHA: sha,
  IMAGE_DIGEST: newDigest,
};

function fixture(options = {}) {
  const config = deploymentConfig(env);
  const calls = [];
  let time = 0;
  let updated = false;
  let tag = options.tag ?? oldDigest;
  const definition =
    "arn:aws:ecs:ap-northeast-2:111111111111:task-definition/frontend:1";
  const service = () => ({
    status: "ACTIVE",
    desiredCount: updated
      ? (options.afterCount ?? options.count ?? 1)
      : (options.count ?? 1),
    runningCount: options.count ?? 1,
    pendingCount: 0,
    taskDefinition: definition,
    deployments: [
      {
        id: updated && !options.rollback ? "new" : "old",
        status: "PRIMARY",
        rolloutState: updated
          ? (options.rollout ?? "COMPLETED")
          : (options.beforeRollout ?? "COMPLETED"),
      },
    ],
  });
  const aws = (api, operation, args) => {
    calls.push({ api, operation, args });
    const value = (flag) => args[args.indexOf(flag) + 1];
    switch (operation) {
      case "describe-services":
        return options.missing
          ? { failures: [{ reason: "MISSING" }], services: [] }
          : { services: [service()] };
      case "describe-task-definition":
        return {
          taskDefinition: {
            containerDefinitions: [
              {
                name: "frontend",
                image: options.image ?? config.image,
                versionConsistency: "enabled",
              },
            ],
          },
        };
      case "list-tasks":
        return {
          taskArns: Array.from(
            { length: options.listCount ?? options.count ?? 1 },
            (_, i) => `task-${i}`,
          ),
        };
      case "describe-tasks":
        return {
          tasks: args.slice(args.indexOf("--tasks") + 1).map((taskArn, i) => ({
            taskArn,
            taskDefinitionArn: definition,
            lastStatus: "RUNNING",
            startedBy: updated
              ? options.oldSecondTask && i === 1
                ? "old"
                : "new"
              : "old",
            containers: [
              {
                name: "frontend",
                lastStatus: "RUNNING",
                imageDigest: updated
                  ? options.mixedAfter && i === 1
                    ? oldDigest
                    : (options.actualDigest ?? newDigest)
                  : options.mixedBefore && i === 1
                    ? newDigest
                    : oldDigest,
              },
            ],
          })),
        };
      case "batch-get-image": {
        const digest = value("--image-ids").split("=")[1];
        return {
          images: (options.tags ?? ["commit"]).map((imageTag, index) => ({
            imageId: {
              imageDigest:
                index > 0 && options.wrongManifestDigest ? newDigest : digest,
              imageTag,
            },
            imageManifest:
              index > 0 && options.inconsistentManifest ? "different" : digest,
          })),
        };
      }
      case "describe-images":
        return { imageDetails: [{ imageDigest: tag }] };
      case "put-image":
        if (updated && options.recoveryError) throw new Error("복구 권한 오류");
        tag = value("--image-manifest");
        return { image: { imageId: { imageDigest: tag } } };
      case "update-service":
        if (options.updateError) throw new Error("AccessDenied");
        updated = true;
        if (options.externalTag) tag = options.externalTag;
        return {
          service: {
            ...service(),
            deployments: [{ id: "new", status: "PRIMARY" }],
          },
        };
      default:
        throw new Error(`예상하지 않은 API: ${operation}`);
    }
  };
  let headReads = 0;
  return {
    calls,
    tag: () => tag,
    run: () =>
      deployImage({
        config,
        aws,
        now: () => time,
        headSha: () => (options.staleAt === ++headReads ? "d".repeat(40) : sha),
        sleep: async (ms) => {
          time += ms;
        },
        summary: () => {},
        timeoutMs: 90000,
      }),
  };
}

test("develop/dev, main/prod 매핑과 PR·임의 브랜치 배포 차단", () => {
  assert.equal(deploymentConfig(env).environment, "dev");
  assert.equal(
    deploymentConfig({ ...env, GITHUB_REF_NAME: "main" }).environment,
    "prod",
  );
  for (const patch of [
    { GITHUB_EVENT_NAME: "pull_request" },
    { GITHUB_REF_NAME: "feature/test" },
    { IMAGE_DIGEST: "latest" },
    { AWS_ACCOUNT_ID: "" },
  ]) {
    assert.throws(() => deploymentConfig({ ...env, ...patch }));
  }
});

test("동일 digest에 commit/deploy 태그가 함께 있어도 배포와 실패 복구가 가능하다", async () => {
  const success = fixture({ tags: ["commit", "deploy"] });
  assert.deepEqual(await success.run(), {
    deploymentId: "new",
    digest: newDigest,
  });
  const failure = fixture({ tags: ["commit", "deploy"], updateError: true });
  await assert.rejects(failure.run());
  assert.equal(failure.tag(), oldDigest);
});

for (const options of [
  { tags: [] },
  { tags: ["commit", "deploy"], wrongManifestDigest: true },
  { tags: ["commit", "deploy"], inconsistentManifest: true },
])
  test(`비어 있거나 서로 다른 manifest 응답은 쓰기 전에 차단한다: ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    await assert.rejects(f.run(), /ECR manifest/);
    assert.ok(
      !f.calls.some((c) =>
        ["put-image", "update-service"].includes(c.operation),
      ),
    );
  });

test("완료 deployment와 실행 digest가 모두 맞아야 성공하며 task definition을 바꾸지 않는다", async () => {
  const f = fixture();
  assert.deepEqual(await f.run(), { deploymentId: "new", digest: newDigest });
  assert.equal(f.tag(), newDigest);
  const update = f.calls.find((c) => c.operation === "update-service");
  assert.deepEqual(update.args, [
    "--cluster",
    "soma-376-frontend-dev",
    "--service",
    "soma-376-frontend-dev",
    "--force-new-deployment",
  ]);
});

for (const staleAt of [1, 2])
  test(`HEAD 변경 시 AWS 쓰기 없이 종료 (${staleAt})`, async () => {
    const f = fixture({ staleAt });
    assert.deepEqual(await f.run(), { skipped: true });
    assert.ok(
      !f.calls.some((c) =>
        ["put-image", "update-service"].includes(c.operation),
      ),
    );
  });

for (const [name, options] of [
  ["없는 서비스", { missing: true }],
  ["digest 고정 task definition", { image: "repo@" + oldDigest }],
  ["진행 중인 배포", { beforeRollout: "IN_PROGRESS" }],
  ["태그와 실행 이미지 불일치", { tag: newDigest }],
])
  test(`${name}는 태그/서비스를 변경하지 않는다`, async () => {
    const f = fixture(options);
    await assert.rejects(f.run());
    assert.ok(
      !f.calls.some((c) =>
        ["put-image", "update-service"].includes(c.operation),
      ),
    );
  });

for (const [name, options] of [
  ["ECS 갱신 API 실패", { updateError: true }],
  ["circuit breaker 실패", { rollout: "FAILED" }],
  ["이전 deployment로 롤백", { rollback: true }],
  ["완료됐지만 다른 digest 실행", { actualDigest: oldDigest }],
  ["배포 시간 초과", { rollout: "IN_PROGRESS" }],
])
  test(`${name}를 성공으로 처리하지 않고 태그를 이전 실행 이미지로 복구한다`, async () => {
    const f = fixture(options);
    await assert.rejects(f.run());
    assert.equal(f.tag(), oldDigest);
  });

test("외부에서 변경한 배포 태그는 복구 과정에서 덮어쓰지 않는다", async () => {
  const externalTag = `sha256:${"e".repeat(64)}`;
  const f = fixture({ rollout: "FAILED", externalTag });
  await assert.rejects(f.run());
  assert.equal(f.tag(), externalTag);
  assert.equal(f.calls.filter((c) => c.operation === "put-image").length, 1);
});

test("태그 복구 실패도 원래 배포 실패를 성공으로 바꾸지 않는다", async () => {
  const f = fixture({ rollout: "FAILED", recoveryError: true });
  await assert.rejects(f.run(), /배포가 실패/);
  assert.equal(f.tag(), newDigest);
});

for (const count of [1, 2, 101]) {
  test(`desiredCount ${count}개의 모든 태스크를 확인하고 배포한다`, async () => {
    const f = fixture({ count });
    assert.deepEqual(await f.run(), { deploymentId: "new", digest: newDigest });
    assert.ok(
      f.calls
        .filter((c) => c.operation === "describe-tasks")
        .every((c) => c.args.length <= 103),
    );
  });
}
for (const options of [
  { count: 0 },
  { count: 2, listCount: 1 },
  { count: 2, mixedBefore: true },
]) {
  test(`불완전한 배포 전 태스크는 쓰기 전에 차단: ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    await assert.rejects(f.run());
    assert.ok(
      !f.calls.some((c) =>
        ["put-image", "update-service"].includes(c.operation),
      ),
    );
  });
}
for (const options of [
  { count: 2, mixedAfter: true },
  { count: 2, oldSecondTask: true },
  { count: 2, afterCount: 3 },
]) {
  test(`일부 태스크 불일치·배포 중 규모 변경은 실패하고 태그 복구: ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    await assert.rejects(f.run());
    assert.equal(f.tag(), oldDigest);
  });
}
