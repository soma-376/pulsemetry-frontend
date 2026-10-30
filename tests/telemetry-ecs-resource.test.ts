import assert from "node:assert/strict";
import test from "node:test";
import { getEcsResourceAttributes } from "../src/lib/telemetry/ecs-resource";

const endpoint = "http://169.254.170.2/v4/container";
const TaskARN = "arn:aws:ecs:ap-northeast-2:123456789012:task/dev/abcdef123456";

test("ECS 태스크와 AZ를 리소스 속성으로 추출한다", async () => {
  const attributes = await getEcsResourceAttributes(
    endpoint + "/",
    async (url, options) => {
      assert.equal(url, endpoint + "/task");
      assert.equal(options?.redirect, "error");
      assert.ok(options?.signal);
      return Response.json({
        TaskARN,
        AvailabilityZone: "ap-northeast-2c",
        Containers: [{ Secret: "not-exported" }],
      });
    },
  );
  assert.deepEqual(attributes, {
    "aws.ecs.task.arn": TaskARN,
    "aws.ecs.task.id": "abcdef123456",
    "cloud.availability_zone": "ap-northeast-2c",
  });
});

test("AZ가 없는 응답은 태스크 ID만 유지하고 AZ를 추정하지 않는다", async () => {
  const attributes = await getEcsResourceAttributes(endpoint, async () =>
    Response.json({ TaskARN }),
  );
  assert.equal(attributes["aws.ecs.task.id"], "abcdef123456");
  assert.equal(attributes["cloud.availability_zone"], undefined);
});

test("로컬은 조회하지 않고 실패·잘못된 응답은 기동을 막지 않는다", async () => {
  assert.deepEqual(
    await getEcsResourceAttributes("", async () => {
      throw new Error("must not call");
    }),
    {},
  );
  for (const fetcher of [
    async () => new Response(null, { status: 500 }),
    async () => Response.json({ TaskARN: "invalid" }),
    async () => {
      throw new DOMException("Timeout", "TimeoutError");
    },
  ]) {
    assert.deepEqual(await getEcsResourceAttributes(endpoint, fetcher), {});
  }
});
