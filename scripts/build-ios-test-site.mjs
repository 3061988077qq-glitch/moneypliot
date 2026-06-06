import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const siteDir = join(root, "ios-test-site");
const appDir = join(siteDir, "app");

const appFiles = [
  "index.html",
  "manifest.webmanifest",
  "service-worker.js"
];

const appDirs = [
  "assets",
  "src"
];

await mkdir(siteDir, { recursive: true });
await rm(appDir, { recursive: true, force: true });
await mkdir(appDir, { recursive: true });

for (const file of appFiles) {
  await cp(join(root, file), join(appDir, file));
}

for (const dir of appDirs) {
  await cp(join(root, dir), join(appDir, dir), { recursive: true });
}

console.log("MoneyPilot ios-test-site/app refreshed.");
