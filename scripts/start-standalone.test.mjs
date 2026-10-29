import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("standalone loads root production env before changing cwd and preserves overrides", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "standalone-env-"));
  try {
    await mkdir(path.join(root, "scripts"));
    await mkdir(path.join(root, ".next/standalone"), { recursive: true });
    await mkdir(path.join(root, ".next/static"));
    await mkdir(path.join(root, "public"));
    await symlink(
      fileURLToPath(new URL("../node_modules", import.meta.url)),
      path.join(root, "node_modules"),
      "dir",
    );
    await cp(
      new URL("./start-standalone.mjs", import.meta.url),
      path.join(root, "scripts/start-standalone.mjs"),
    );
    await writeFile(
      path.join(root, ".env.local"),
      "BFF_SESSION_KEYS=fixture-key\nBFF_ORIGIN=http://localhost:3000\nENV_PRIORITY=local\n",
    );
    await writeFile(
      path.join(root, ".env.production.local"),
      "ENV_PRIORITY=production-local\n",
    );
    await writeFile(path.join(root, ".next/static/test.css"), "body{}");
    await writeFile(
      path.join(root, ".next/standalone/server.js"),
      `
      process.chdir(__dirname);
      console.log(JSON.stringify({
        key: process.env.BFF_SESSION_KEYS,
        origin: process.env.BFF_ORIGIN,
        priority: process.env.ENV_PRIORITY,
        mode: process.env.NODE_ENV
      }));
    `,
    );
    const output = execFileSync(
      process.execPath,
      [path.join(root, "scripts/start-standalone.mjs")],
      {
        cwd: os.tmpdir(),
        env: {
          PATH: process.env.PATH,
          NODE_ENV: "development",
          BFF_ORIGIN: "http://localhost:3119",
        },
        encoding: "utf8",
      },
    );
    assert.deepEqual(JSON.parse(output.trim()), {
      key: "fixture-key",
      origin: "http://localhost:3119",
      priority: "production-local",
      mode: "production",
    });
    assert.equal(
      await readFile(
        path.join(root, ".next/standalone/.next/static/test.css"),
        "utf8",
      ),
      "body{}",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
