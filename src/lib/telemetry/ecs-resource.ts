import type { Attributes } from "@opentelemetry/api";
import { z } from "zod";

const taskSchema = z.object({
  TaskARN: z
    .string()
    .regex(/^arn:[^:]+:ecs:[^:]+:\d+:task\/(?:[^/]+\/)?[a-zA-Z0-9-]+$/),
  AvailabilityZone: z.string().min(1).optional(),
});

// 시작 시 한 번만 조회한다. 로컬에서는 요청하지 않고, 실패해도 앱 기동을 막지 않는다.
export async function getEcsResourceAttributes(
  endpoint = process.env.ECS_CONTAINER_METADATA_URI_V4,
  fetcher: typeof fetch = fetch,
): Promise<Attributes> {
  if (!endpoint) return {};
  try {
    const response = await fetcher(`${endpoint.replace(/\/+$/, "")}/task`, {
      signal: AbortSignal.timeout(1_000),
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) return {};
    const task = taskSchema.parse(await response.json());
    return {
      "aws.ecs.task.arn": task.TaskARN,
      "aws.ecs.task.id": task.TaskARN.split("/").at(-1)!,
      ...(task.AvailabilityZone
        ? { "cloud.availability_zone": task.AvailabilityZone }
        : {}),
    };
  } catch {
    return {};
  }
}
