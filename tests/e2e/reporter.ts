import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestError, TestResult } from "@playwright/test/reporter";
import { ANNOTATION, PREPARATION, pacerLog } from "./harness";

type Entry = { id: string; title: string; detail?: string };

/**
 * 실서버 E2E 집계. 통과 수만으로 완료를 말하지 않도록 기능 실패 · 준비 실패(로그인·자원 준비) · 건너뜀 · pacer 대기 ·
 * 관측된 429 를 따로 센다. 결과는 `E2E_RESULTS_DIR`(없으면 `.e2e-artifacts/backend`)의 `e2e-summary.json`이다.
 */
export default class E2EReporter implements Reporter {
  /** 보고기는 globalSetup 전에 만들어진다 — 그 대기도 이 실행의 것으로 센다. */
  private readonly started = new Date();
  private total = 0;
  private passed: Entry[] = [];
  private functional: Entry[] = [];
  private preparation: Entry[] = [];
  private skipped: Entry[] = [];
  private waits: Entry[] = [];
  private unexpected429: Entry[] = [];
  private intended429: Entry[] = [];

  onBegin(_config: FullConfig, suite: Suite) {
    this.total = suite.allTests().length;
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const entry = { id: test.id, title: test.titlePath().slice(1).join(" › ") };
    // 실행 중에 단 주석은 test.annotations 에도 들어가므로 이번 결과의 주석(선언·describe·실행 중 주석을 모두 포함)만 센다.
    const annotations = result.annotations;
    const intended = annotations.some((a) => a.type === ANNOTATION.intended429);
    for (const annotation of annotations) {
      if (annotation.type === ANNOTATION.pacerWait) this.waits.push({ ...entry, detail: `${annotation.description}ms` });
      if (annotation.type === ANNOTATION.observed429) (intended ? this.intended429 : this.unexpected429).push({ ...entry, detail: annotation.description });
    }
    if (result.status === "passed") this.passed.push(entry);
    else if (result.status === "skipped") this.skipped.push(entry);
    else {
      const messages = result.errors.map((error) => error.message ?? "");
      const detail = messages.find((message) => message.includes(PREPARATION)) ?? messages[0] ?? result.status;
      (messages.some((message) => message.includes(PREPARATION)) ? this.preparation : this.functional).push({ ...entry, detail: firstLine(detail) });
    }
  }

  onError(error: TestError) {
    // globalSetup·설정 단계의 실패는 테스트 밖에서 난다. 서버·인증 설정을 확인하지 못한 것이므로 준비 실패다.
    this.preparation.push({ id: "global", title: "실행 준비", detail: firstLine(error.message ?? "") });
  }

  onEnd(result: FullResult) {
    const directory = process.env.E2E_RESULTS_DIR ?? ".e2e-artifacts/backend";
    const logins = readLogins(this.started);
    const waitLog = logins.filter((login) => login.waitedMs > 0);
    const summary = {
      startedAt: this.started.toISOString(),
      finishedAt: new Date().toISOString(),
      status: result.status,
      tests: this.total,
      passed: this.passed.length,
      functionalFailures: this.functional,
      preparationFailures: this.preparation,
      skipped: this.skipped,
      notRun: Math.max(0, this.total - this.passed.length - this.functional.length - this.preparation.filter((e) => e.id !== "global").length - this.skipped.length),
      pacer: { logins: logins.length, waits: waitLog.length, waitedMs: waitLog.reduce((sum, wait) => sum + wait.waitedMs, 0), byTest: this.waits, log: waitLog },
      observed429: { unexpected: this.unexpected429, intended: this.intended429 },
    };
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "e2e-summary.json"), JSON.stringify(summary, null, 2) + "\n");
    console.log(`\nE2E 집계: 통과 ${summary.passed}/${summary.tests} · 기능 실패 ${this.functional.length} · 준비 실패 ${this.preparation.length} · 건너뜀 ${this.skipped.length}` +
      ` · 미실행 ${summary.notRun} · 로그인 ${logins.length} · pacer 대기 ${waitLog.length}회(${summary.pacer.waitedMs}ms) · 429 ${this.unexpected429.length}(의도한 시험 ${this.intended429.length})`);
    for (const [label, list] of [["기능 실패", this.functional], ["준비 실패", this.preparation], ["건너뜀", this.skipped], ["429", this.unexpected429]] as const)
      for (const item of list) console.log(`  ${label}: ${item.title}${item.detail ? ` — ${item.detail}` : ""}`);
    console.log(`  → ${join(directory, "e2e-summary.json")}`);
  }

  printsToStdio() {
    return false;
  }
}

function firstLine(message: string) {
  // 터미널 색 코드와 긴 본문을 덜어 낸다.
  return message.replace(/\u001b\[[0-9;]*m/g, "").split("\n").find((line) => line.trim())?.trim().slice(0, 300) ?? "";
}

/** 이 실행이 시작된 뒤의 로그인(globalSetup 포함). 기록은 파일이라 테스트 밖의 로그인·대기도 남는다. 로그인 시각(대기가 끝난 뒤)으로 적힌다. */
function readLogins(since: Date): { at: string; label: string; waitedMs: number }[] {
  if (!existsSync(pacerLog)) return [];
  return readFileSync(pacerLog, "utf8").split("\n").filter(Boolean)
    .map((line) => JSON.parse(line) as { at: string; label: string; waitedMs: number })
    .filter((wait) => Date.parse(wait.at) >= since.getTime());
}
