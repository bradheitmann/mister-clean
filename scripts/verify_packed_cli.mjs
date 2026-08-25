import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temporaryRoot = mkdtempSync(join(tmpdir(), "mister-clean-packed-cli-"));
const packed = join(temporaryRoot, "packed");
const consumer = join(temporaryRoot, "consumer");

try {
  mkdirSync(packed);
  mkdirSync(consumer);
  writeFileSync(join(consumer, "package.json"), '{"private":true}\n', "utf8");
  execFileSync("bun", ["pm", "pack", "--destination", packed, "--quiet"], {
    cwd: root,
    stdio: "pipe",
  });
  const archives = readdirSync(packed).filter((name) => name.endsWith(".tgz"));
  if (archives.length !== 1) throw new Error(`expected one packed archive, found ${archives.length}`);
  const archive = join(packed, archives[0]);
  execFileSync("npm", ["install", archive, "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: consumer,
    stdio: "pipe",
  });
  const installed = join(consumer, "node_modules", "@bradheitmann", "mister-clean");
  const output = execFileSync(
    process.execPath,
    [
      join(consumer, "node_modules", ".bin", "mister-clean"),
      "validate",
      "bundle",
      join(installed, "assets", "closure-bundle.json"),
      "--template",
      "--structural",
    ],
    { cwd: consumer, encoding: "utf8" },
  );
  if (!output.includes("PASS kind=bundle")) throw new Error(`unexpected CLI output: ${output}`);
  console.log(`packed CLI: PASS under ${process.version}`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
