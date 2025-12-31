#!/usr/bin/env node

import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

try {
  execSync("rollup -c", {
    stdio: "inherit",
    cwd: __dirname,
  });

  execSync("node scripts/copy-to-clipboard.js", {
    stdio: "inherit",
    cwd: __dirname,
  });
} catch {
  process.exit(1);
}
