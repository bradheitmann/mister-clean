import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temporaryRoot = mkdtempSync(join(tmpdir(), "mister-clean-packed-cli-"));
const packed = join(temporaryRoot, "packed");
const standalone = join(temporaryRoot, "standalone");
const consumer = join(temporaryRoot, "consumer");

try {
  mkdirSync(packed);
  mkdirSync(standalone);
  mkdirSync(consumer);
  writeFileSync(join(consumer, "package.json"), '{"private":true}\n', "utf8");
  execFileSync("bun", ["pm", "pack", "--destination", packed, "--quiet"], {
    cwd: root,
    stdio: "pipe",
  });
  const archives = readdirSync(packed).filter((name) => name.endsWith(".tgz"));
  if (archives.length !== 1) throw new Error(`expected one packed archive, found ${archives.length}`);
  const archive = join(packed, archives[0]);

  // Agent skill registries copy the published skill surface without running a
  // package-manager install. Exercise that exact no-node_modules shape before
  // testing the ordinary pnpm consumer path.
  execFileSync("tar", ["-xzf", archive, "-C", standalone], { stdio: "pipe" });
  const unpacked = join(standalone, "package");
  const standaloneOutput = execFileSync(
    process.execPath,
    [
      join(unpacked, "bin", "mister-clean.js"),
      "validate",
      "bundle",
      join(unpacked, "assets", "closure-bundle.json"),
      "--template",
      "--structural",
    ],
    { cwd: standalone, encoding: "utf8" },
  );
  if (!standaloneOutput.includes("PASS kind=bundle")) {
    throw new Error(`unexpected standalone skill CLI output: ${standaloneOutput}`);
  }
  const standaloneManifest = execFileSync(
    process.execPath,
    [join(unpacked, "bin", "mister-clean.js"), "manifest", unpacked, "--package", "--check"],
    { cwd: standalone, encoding: "utf8" },
  );
  if (!standaloneManifest.includes("manifest: PASS")) {
    throw new Error(`unexpected standalone manifest output: ${standaloneManifest}`);
  }

  execFileSync("pnpm", ["add", archive, "--ignore-scripts"], {
    cwd: consumer,
    stdio: "pipe",
  });
  const installed = join(consumer, "node_modules", "@bradheitmann", "mister-clean");
  const installedCli = join(consumer, "node_modules", ".bin", "mister-clean");
  const output = execFileSync(
    installedCli,
    [
      "validate",
      "bundle",
      join(installed, "assets", "closure-bundle.json"),
      "--template",
      "--structural",
    ],
    { cwd: consumer, encoding: "utf8" },
  );
  if (!output.includes("PASS kind=bundle")) throw new Error(`unexpected CLI output: ${output}`);
  const installedManifest = execFileSync(
    installedCli,
    ["manifest", installed, "--package", "--check"],
    { cwd: consumer, encoding: "utf8" },
  );
  if (!installedManifest.includes("manifest: PASS")) {
    throw new Error(`unexpected installed manifest output: ${installedManifest}`);
  }
  console.log(`standalone packed skill CLI: PASS under ${process.version}`);
  console.log(`installed packed CLI: PASS under ${process.version}`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
