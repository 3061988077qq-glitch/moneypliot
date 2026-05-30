import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".svg": "image/svg+xml;charset=utf-8",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json;charset=utf-8",
  ".json": "application/json;charset=utf-8"
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    const requested = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = normalize(join(root, requested));
    if (!filePath.startsWith(root)) throw new Error("Forbidden");
    const body = await readFile(filePath);
    const headers = { "content-type": types[extname(filePath)] || "application/octet-stream" };
    if (requested === "/service-worker.js") headers["cache-control"] = "no-cache";
    response.writeHead(200, headers);
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain;charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, host, () => {
  console.log(`MoneyPilot Web running at http://${host}:${port}`);
});
