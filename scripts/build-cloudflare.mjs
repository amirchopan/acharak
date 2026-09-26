import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configuredOutputDirectory = process.env.CLOUDFLARE_ASSETS_DIR || "dist";
const outputDirectory = path.resolve(projectRoot, configuredOutputDirectory);
const outputRelativePath = path.relative(projectRoot, outputDirectory);
if (
  !outputRelativePath
  || outputRelativePath === ".."
  || outputRelativePath.startsWith(`..${path.sep}`)
) {
  throw new Error("Cloudflare asset output must be a directory inside the project.");
}
const publicEntries = [
  "index.html",
  "manifest.json",
  "service-worker.js",
  "css",
  "js",
  "assets",
];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const entry of publicEntries) {
  await cp(
    path.join(projectRoot, entry),
    path.join(outputDirectory, entry),
    { recursive: true },
  );
}

console.log(`Built Cloudflare static assets in ${path.relative(projectRoot, outputDirectory)}.`);
