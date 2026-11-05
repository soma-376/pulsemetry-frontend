import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

function duration(start, end) {
  if (!start || !end) return "—";
  const seconds = Math.round((Date.parse(end) - Date.parse(start)) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  return `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
}

function bounds(items, field, latest = false) {
  const values = items
    .filter((item) => item.conclusion !== "skipped")
    .map((item) => item[field])
    .filter((value) => value && Number.isFinite(Date.parse(value)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return latest ? values.at(-1) : values[0];
}

export function timingReport(run, jobs) {
  // The report job is still running; do not include it in deployment duration.
  const work = jobs.filter((job) => job.name !== "Report CD timings");
  const ci = work.filter((job) =>
    job.name.startsWith("Verify release commit / "),
  );
  const publish = work.find(
    (job) => job.name === "publish image and deploy ECS",
  );
  const stages = [
    [
      "배포 이미지 빌드 (캐시 복원·저장 포함)",
      "Build image with public environment",
    ],
    ["ECR 업로드·digest 확인", "Push immutable image and record digest"],
    ["ECS 교체·실행 digest 확인", "Deploy image and verify running digest"],
  ];
  const rows = [
    [
      "첫 작업 시작 전 대기",
      duration(run.run_started_at, bounds(work, "started_at")),
      "동시 실행 제한·러너 대기 포함",
    ],
    [
      "CI 검증",
      duration(bounds(ci, "started_at"), bounds(ci, "completed_at", true)),
      "병렬 작업의 경과 시간",
    ],
    ...stages.map(([label, name]) => {
      const step = publish?.steps?.find((item) => item.name === name);
      return [
        label,
        step?.conclusion === "skipped"
          ? "—"
          : duration(step?.started_at, step?.completed_at),
        step?.conclusion ?? "미실행",
      ];
    }),
    [
      "배포 작업 종료까지 (대기 포함)",
      duration(run.run_started_at, bounds(work, "completed_at", true)),
      "준비·정리 포함, 이 보고 작업 제외",
    ],
  ];
  return [
    "### CD 단계별 소요 시간",
    "",
    `실행 ${run.id} / 시도 ${run.run_attempt}`,
    "",
    "| 단계 | 소요 시간 | 비고 |",
    "| --- | --- | --- |",
    ...rows.map((row) => `| ${row.join(" | ")} |`),
    "",
    "실패·건너뜀 여부는 각 단계의 결과를 확인한다. 이 표는 배포 성공 판정이 아니다.",
    "작업 사이의 대기와 Environment 승인 대기는 전체 시간에 포함되므로 단계 합계와 다를 수 있다.",
    "",
  ].join("\n");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const {
    GITHUB_REPOSITORY,
    GITHUB_RUN_ID,
    GITHUB_RUN_ATTEMPT,
    GITHUB_STEP_SUMMARY,
  } = process.env;
  if (
    !GITHUB_REPOSITORY ||
    !GITHUB_RUN_ID ||
    !GITHUB_RUN_ATTEMPT ||
    !GITHUB_STEP_SUMMARY
  )
    throw new Error("GitHub Actions 실행 정보와 summary 경로가 필요합니다.");
  const endpoint = `repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/attempts/${GITHUB_RUN_ATTEMPT}`;
  const request = (...args) =>
    JSON.parse(
      execFileSync("gh", ["api", ...args], {
        encoding: "utf8",
        timeout: 60000,
      }),
    );
  const run = request(endpoint);
  const pages = request(
    `${endpoint}/jobs?per_page=100`,
    "--paginate",
    "--slurp",
  );
  appendFileSync(
    GITHUB_STEP_SUMMARY,
    timingReport(
      run,
      pages.flatMap((page) => page.jobs),
    ),
  );
}
