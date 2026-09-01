#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const assetRoot = join(root, "assets", "codebase-state-dashboard");
const sourcePath = join(assetRoot, "model-scorecard-interactions.ts");
const outputPath = join(assetRoot, "model-scorecard-interactions.js");
const templatePath = join(assetRoot, "model-scorecard.html");
const configPath = join(assetRoot, "tsconfig.scorecard.json");
const checkOnly = process.argv.includes("--check");

const typecheck = spawnSync(join(root, "node_modules", ".bin", "tsc"), ["-p", configPath], {
  cwd: root,
  encoding: "utf8",
});
if (typecheck.status !== 0) {
  process.stderr.write(typecheck.stdout);
  process.stderr.write(typecheck.stderr);
  process.exit(typecheck.status ?? 1);
}

const result = await Bun.build({
  entrypoints: [sourcePath],
  format: "esm",
  target: "browser",
  minify: false,
  sourcemap: "none",
  write: false,
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
if (result.outputs.length !== 1) {
  throw new Error(`expected one browser artifact, received ${result.outputs.length}`);
}

const source = readFileSync(sourcePath);
const sourceSha256 = createHash("sha256").update(source).digest("hex");
const compiledBody = (await result.outputs[0].text()).replaceAll("\r\n", "\n").trimEnd();
const compiled = `/* Generated from model-scorecard-interactions.ts · SHA-256 ${sourceSha256}. */\n${compiledBody}\n`;

const startMarker = "/* MISTER_CLEAN_SCORECARD_INTERACTIONS_START */";
const endMarker = "/* MISTER_CLEAN_SCORECARD_INTERACTIONS_END */";
const template = readFileSync(templatePath, "utf8");
const start = template.indexOf(startMarker);
const end = template.indexOf(endMarker);
if (start < 0 || end < 0 || end <= start) throw new Error("scorecard template interaction markers are missing or malformed");
const inlineStart = start + startMarker.length;
const renderedTemplate = `${template.slice(0, inlineStart)}\n${compiled}${template.slice(end)}`;

const mismatches = [];
if (!existsSync(outputPath) || readFileSync(outputPath, "utf8") !== compiled) mismatches.push(outputPath);
if (template !== renderedTemplate) mismatches.push(templatePath);
if (checkOnly) {
  if (mismatches.length) {
    throw new Error(`generated scorecard interactions are stale: ${mismatches.join(", ")}`);
  }
} else {
  writeFileSync(outputPath, compiled, "utf8");
  if (template !== renderedTemplate) writeFileSync(templatePath, renderedTemplate, "utf8");
}

console.error(`${checkOnly ? "Verified" : "Built"} deterministic scorecard interactions ${sourceSha256.slice(0, 12)}`);
