import { mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const distDir = join(root, "dist");
const archivePath = join(distDir, "moneypilot-ios-test-site.zip");

await mkdir(distDir, { recursive: true });
await rm(archivePath, { force: true });

await run("npm", ["run", "build:ios-test"]);
await run("zip", ["-r", "-X", archivePath, "ios-test-site"]);

console.log(`MoneyPilot iOS test package created: ${archivePath}`);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}
