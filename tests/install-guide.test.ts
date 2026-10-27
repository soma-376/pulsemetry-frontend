import assert from "node:assert/strict";
import { test } from "node:test";
import {
  detectInstallPlatform,
  installCommand,
  parseInstallCode,
} from "../src/lib/install-guide";

test("초대 코드는 서버 normalize와 같은 규칙으로 정규화한다", () => {
  assert.deepEqual(parseInstallCode("ABCD-EFGH-JKMN"), {
    kind: "ok",
    code: "ABCD-EFGH-JKMN",
  });
  assert.deepEqual(parseInstallCode("  abcdefghjkmn "), {
    kind: "ok",
    code: "ABCD-EFGH-JKMN",
  });
  assert.deepEqual(parseInstallCode(["0123-4567-89AB", "ZZZZ-ZZZZ-ZZZZ"]), {
    kind: "ok",
    code: "0123-4567-89AB",
  });
  for (const missing of [undefined, "", "   ", []])
    assert.deepEqual(parseInstallCode(missing), { kind: "missing" });
  for (const invalid of [
    "ABCD-EFGH-JKMO", // O는 Crockford Base32에 없다
    "ABCD-EFGH-JKM",
    "ABCDEFGHJKMNP",
    "ABCD-EFGHJKMN",
    "ABCD-EFGH-JKMN'; rm -rf /",
  ])
    assert.deepEqual(parseInstallCode(invalid), { kind: "invalid" });
});

test("설치 명령은 초대 메일과 같은 형식이다", () => {
  assert.equal(
    installCommand("macos", "ABCD-EFGH-JKMN", "https://get.example.test/"),
    "curl -fsSL 'https://get.example.test/unix?code=ABCD-EFGH-JKMN' | sh",
  );
  assert.equal(
    installCommand("linux", "ABCD-EFGH-JKMN", "https://get.example.test"),
    "curl -fsSL 'https://get.example.test/unix?code=ABCD-EFGH-JKMN' | sh",
  );
  assert.equal(
    installCommand("windows", "ABCD-EFGH-JKMN", "https://get.example.test"),
    "irm 'https://get.example.test/windows?code=ABCD-EFGH-JKMN' | iex",
  );
});

test("운영체제는 Client Hint를 먼저, 없으면 User-Agent로 고른다", () => {
  assert.equal(detectInstallPlatform(null, '"Windows"'), "windows");
  assert.equal(
    detectInstallPlatform("Mozilla/5.0 (Windows NT 10.0)", '"macOS"'),
    "macos",
  );
  assert.equal(
    detectInstallPlatform("Mozilla/5.0 (X11; Linux x86_64)", null),
    "linux",
  );
  assert.equal(
    detectInstallPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)", null),
    "macos",
  );
  assert.equal(detectInstallPlatform(null, null), "macos");
});
