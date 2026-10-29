import { access, cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import nextEnv from "@next/env";

const root = fileURLToPath(new URL("../", import.meta.url));
// The generated server changes cwd to standalone. Load the project's runtime
// configuration first, preserving environment variables supplied by the caller.
process.env.NODE_ENV = "production";
nextEnv.loadEnvConfig(root, false);
const distDir = process.env.NEXT_DIST_DIR || ".next";
const build = path.resolve(root, distDir);
const standalone = path.join(build, "standalone");
const server = path.join(standalone, "server.js");

try {
  await access(server);
} catch {
  console.error(
    `Standalone build not found: ${server}. Run npm run build first (with the same NEXT_DIST_DIR).`,
  );
  process.exit(1);
}

// Next.js leaves these assets out of standalone; serve them locally as Docker does.
const staticTarget = path.join(standalone, distDir, "static");
await mkdir(staticTarget, { recursive: true });
await cp(path.join(build, "static"), staticTarget, { recursive: true });
await cp(path.join(root, "public"), path.join(standalone, "public"), {
  recursive: true,
});

await import(pathToFileURL(server).href);
