const input = process.argv[2] || process.env.MONEYPILOT_URL;
if (!input) {
  throw new Error("Usage: npm run check:deploy-url -- https://your-domain.example/");
}

const base = normalizeURL(input);
if (base.protocol !== "https:" && !["localhost", "127.0.0.1", "::1"].includes(base.hostname)) {
  throw new Error("Deployed iPhone PWA URL must use HTTPS.");
}

const index = await fetchText(new URL("./", base), "text/html");
for (const needle of ["manifest.webmanifest", "apple-mobile-web-app-capable", "./src/app.js"]) {
  if (!index.body.includes(needle)) throw new Error(`Index page is missing ${needle}.`);
}

const appSource = await fetchText(new URL("./src/app.js", base), "javascript");
for (const needle of ["service-worker.js", "checkForAppUpdate", "loadPersistentState"]) {
  if (!appSource.body.includes(needle)) throw new Error(`App source is missing ${needle}.`);
}

const manifest = await fetchJSON(new URL("./manifest.webmanifest", base), "application/manifest+json");
if (manifest.body.display !== "standalone") throw new Error("Manifest display must be standalone.");
if (manifest.body.start_url !== "./") throw new Error("Manifest start_url must be ./ for hosted subpaths.");
if (manifest.body.scope !== "./") throw new Error("Manifest scope must be ./ for hosted subpaths.");

const icon180 = manifest.body.icons?.find((icon) => icon.sizes === "180x180" && icon.type === "image/png");
const icon512 = manifest.body.icons?.find((icon) => icon.sizes === "512x512" && icon.purpose?.includes("maskable"));
if (!icon180) throw new Error("Manifest is missing the 180x180 iOS PNG icon.");
if (!icon512) throw new Error("Manifest is missing the maskable 512x512 PNG icon.");

await fetchBinary(new URL(icon180.src, base), "image/png");
await fetchBinary(new URL(icon512.src, base), "image/png");

const serviceWorker = await fetchText(new URL("./service-worker.js", base), "javascript");
if (!serviceWorker.body.includes("APP_VERSION")) throw new Error("Service worker is missing APP_VERSION.");
if (!serviceWorker.body.includes("request.mode === \"navigate\"")) throw new Error("Service worker is missing navigation fallback.");
if (!serviceWorker.body.includes("SKIP_WAITING")) throw new Error("Service worker is missing explicit update activation.");

const swCacheControl = serviceWorker.headers.get("cache-control") || "";
if (!/no-cache|no-store|max-age=0/i.test(swCacheControl)) {
  if (base.hostname.endsWith(".github.io")) {
    console.warn(`Warning: GitHub Pages controls service-worker.js caching (${swCacheControl || "none"}). App updates may take a few minutes to appear.`);
  } else {
    throw new Error("service-worker.js must be served with Cache-Control: no-cache.");
  }
}

console.log(`MoneyPilot deployed PWA check passed: ${base.href}`);

function normalizeURL(value) {
  const url = new URL(value);
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

async function fetchText(url, contentTypeNeedle) {
  const response = await fetch(url, { cache: "no-store" });
  assertOK(response, url, contentTypeNeedle);
  return { body: await response.text(), headers: response.headers };
}

async function fetchJSON(url, contentTypeNeedle) {
  const response = await fetch(url, { cache: "no-store" });
  assertOK(response, url, contentTypeNeedle);
  return { body: await response.json(), headers: response.headers };
}

async function fetchBinary(url, contentTypeNeedle) {
  const response = await fetch(url, { cache: "no-store" });
  assertOK(response, url, contentTypeNeedle);
  return { body: new Uint8Array(await response.arrayBuffer()), headers: response.headers };
}

function assertOK(response, url, contentTypeNeedle) {
  if (!response.ok) throw new Error(`${url.href} returned HTTP ${response.status}.`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes(contentTypeNeedle.toLowerCase())) {
    throw new Error(`${url.href} returned unexpected content-type: ${contentType}.`);
  }
}
