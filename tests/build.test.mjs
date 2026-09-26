import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Cloudflare build contains only the app shell and its public dependencies", () => {
  const outputDirectory = path.join(projectRoot, `.test-assets-${randomUUID()}`);
  mkdirSync(outputDirectory);
  try {
    execFileSync(process.execPath, ["scripts/build-cloudflare.mjs"], {
      cwd: projectRoot,
      env: { ...process.env, CLOUDFLARE_ASSETS_DIR: outputDirectory },
      stdio: "pipe",
    });

    for (const file of [
      "index.html",
      "manifest.json",
      "service-worker.js",
      "css/style.css",
      "js/app.js",
      "js/account-sync.js",
      "assets/data/cars.json",
      "assets/symbols/settings.svg",
    ]) {
      assert.ok(existsSync(path.join(outputDirectory, file)), `Missing public file: ${file}`);
    }

    for (const file of [
      "worker/index.mjs",
      "migrations/0001_initial_schema.sql",
      "tests/worker.test.mjs",
      "wrangler.jsonc",
      ".dev.vars",
    ]) {
      assert.equal(existsSync(path.join(outputDirectory, file)), false, `Unexpected private file: ${file}`);
    }

    assert.match(
      readFileSync(path.join(outputDirectory, "index.html"), "utf8"),
      /<main id="app"/,
    );
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
});
