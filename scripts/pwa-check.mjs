import { readFile, stat } from "node:fs/promises";

const requiredFiles = [
  "index.html",
  "manifest.webmanifest",
  "service-worker.js",
  "assets/icon.svg",
  "assets/icon-180.png",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "src/app.js",
  "src/domain.js",
  "src/importers.js",
  "src/storage.js",
  "src/styles.css"
];

const deploymentFiles = [
  "netlify.toml",
  "vercel.json",
  ".github/workflows/pages.yml",
  ".nojekyll",
  "README.md",
  "DEPLOYMENT.md",
  "scripts/verify-deploy-url.mjs"
];

for (const file of requiredFiles) {
  const info = await stat(file);
  if (!info.isFile() || info.size === 0) throw new Error(`${file} is missing or empty.`);
}

for (const file of deploymentFiles) {
  const info = await stat(file);
  if (!info.isFile() || info.size === 0) throw new Error(`${file} is missing or empty.`);
}

const manifest = JSON.parse(await readFile("manifest.webmanifest", "utf8"));
if (manifest.display !== "standalone") throw new Error("manifest.display must be standalone.");
if (manifest.id !== "./") throw new Error("manifest.id must be ./ for stable PWA identity.");
if (manifest.start_url !== "./") throw new Error("manifest.start_url must be ./ for subpath hosting.");
if (manifest.scope !== "./") throw new Error("manifest.scope must be ./ for GitHub Pages and static hosts.");
if (manifest.orientation !== "portrait") throw new Error("manifest.orientation must be portrait for iPhone use.");
if (!manifest.icons?.some((icon) => icon.sizes === "180x180" && icon.type === "image/png")) {
  throw new Error("manifest must include a PNG 180x180 iOS touch icon.");
}
if (!manifest.icons?.some((icon) => icon.sizes === "512x512" && icon.purpose?.includes("maskable"))) {
  throw new Error("manifest must include a maskable 512x512 icon.");
}

await assertPng("assets/icon-180.png", 180, 180);
await assertPng("assets/icon-192.png", 192, 192);
await assertPng("assets/icon-512.png", 512, 512);

const index = await readFile("index.html", "utf8");
for (const needle of [
  'rel="manifest"',
  'apple-mobile-web-app-capable',
  'apple-touch-icon',
  'mobile-web-app-capable',
  'viewport-fit=cover',
  './src/app.js'
]) {
  if (!index.includes(needle)) throw new Error(`index.html is missing ${needle}.`);
}

const serviceWorker = await readFile("service-worker.js", "utf8");
const serviceWorkerVersion = serviceWorker.match(/APP_VERSION\s*=\s*"(\d{4}\.\d{2}\.\d{2}\.\d+)"/)?.[1];
if (!serviceWorkerVersion) {
  throw new Error("service worker APP_VERSION must be date-based and bumped for deploys.");
}
for (const file of requiredFiles.filter((file) => file !== "service-worker.js")) {
  if (!serviceWorker.includes(`./${file}`)) throw new Error(`service worker does not pre-cache ${file}.`);
}
if (!serviceWorker.includes('request.mode === "navigate"')) {
  throw new Error("service worker must provide a navigation fallback for offline launches.");
}
if (!serviceWorker.includes("cache: \"reload\"")) {
  throw new Error("service worker install must bypass stale HTTP cache.");
}
if (!serviceWorker.includes("SKIP_WAITING")) {
  throw new Error("service worker must support explicit update activation.");
}

const appSource = await readFile("src/app.js", "utf8");
const appVersion = appSource.match(/APP_VERSION\s*=\s*"(\d{4}\.\d{2}\.\d{2}\.\d+)"/)?.[1];
if (appVersion !== serviceWorkerVersion) {
  throw new Error(`app version ${appVersion} must match service worker version ${serviceWorkerVersion}.`);
}
for (const needle of [
  "exportBackup",
  "restoreBackupFile",
  "导出完整备份",
  "恢复完整备份",
  "loadPersistentState",
  "hydratePersistentLedger",
  "durableLedgerReady",
  "checkForAppUpdate",
  "activateAppUpdate",
  "检查更新",
  "立即更新",
  "requestPersistentStorage",
  "添加到主屏幕"
]) {
  if (!appSource.includes(needle)) throw new Error(`src/app.js is missing ${needle}.`);
}

const storageSource = await readFile("src/storage.js", "utf8");
for (const needle of [
  "money-pilot-web-backup",
  "money-pilot-web-local-ledger",
  "exportBackup",
  "restoreBackupFile",
  "loadPersistentState",
  "normalizeState"
]) {
  if (!storageSource.includes(needle)) throw new Error(`src/storage.js is missing ${needle}.`);
}

const netlify = await readFile("netlify.toml", "utf8");
if (!netlify.includes('Cache-Control = "no-cache"')) {
  throw new Error("netlify.toml must prevent stale service-worker caching.");
}

const vercel = JSON.parse(await readFile("vercel.json", "utf8"));
if (!JSON.stringify(vercel).includes("no-cache")) {
  throw new Error("vercel.json must prevent stale service-worker caching.");
}

const pages = await readFile(".github/workflows/pages.yml", "utf8");
for (const needle of ["contents: write", "npm run check:pwa", "Publish to gh-pages", "git push --force origin gh-pages"]) {
  if (!pages.includes(needle)) throw new Error(`GitHub Pages workflow is missing ${needle}.`);
}

const devServer = await readFile("scripts/dev-server.mjs", "utf8");
if (!devServer.includes("cache-control") || !devServer.includes("/service-worker.js")) {
  throw new Error("dev server must disable HTTP caching for service-worker.js.");
}

const deployURLCheck = await readFile("scripts/verify-deploy-url.mjs", "utf8");
for (const needle of ["https:", "service-worker.js", "Cache-Control", "MoneyPilot deployed PWA check passed"]) {
  if (!deployURLCheck.includes(needle)) throw new Error(`deploy URL checker is missing ${needle}.`);
}

const docs = `${await readFile("README.md", "utf8")}\n${await readFile("DEPLOYMENT.md", "utf8")}`;
for (const needle of ["HTTPS", "7 天", "添加到主屏幕", "完整备份", "IndexedDB", "检查更新", "check:deploy-url"]) {
  if (!docs.includes(needle)) throw new Error(`docs must mention ${needle}.`);
}

console.log("MoneyPilot Web PWA check passed.");

async function assertPng(path, width, height) {
  const data = await readFile(path);
  const signature = "89504e470d0a1a0a";
  if (data.subarray(0, 8).toString("hex") !== signature) throw new Error(`${path} is not a PNG.`);
  const actualWidth = data.readUInt32BE(16);
  const actualHeight = data.readUInt32BE(20);
  if (actualWidth !== width || actualHeight !== height) {
    throw new Error(`${path} must be ${width}x${height}, got ${actualWidth}x${actualHeight}.`);
  }
}
