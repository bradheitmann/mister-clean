#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { basename, resolve } from "node:path";
import { writeFileSync } from "node:fs";

function usage(message) {
  if (message) console.error(message);
  console.error(
    "Usage: bun scripts/generate_codebase_history.mjs [--repo PATH] [--ref REF] [--label NAME] [--out FILE]",
  );
  process.exit(message ? 2 : 0);
}

const options = {
  repo: process.cwd(),
  ref: "main",
  label: undefined,
  out: undefined,
};

for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === "--help" || argument === "-h") usage();
  if (!["--repo", "--ref", "--label", "--out"].includes(argument)) {
    usage(`Unknown option: ${argument}`);
  }
  const value = process.argv[index + 1];
  if (!value) usage(`Missing value for ${argument}`);
  options[argument.slice(2)] = value;
  index += 1;
}

const repositoryPath = resolve(options.repo);
const runGit = (args, encoding = "utf8") =>
  execFileSync("git", ["-C", repositoryPath, ...args], {
    encoding,
    maxBuffer: 256 * 1024 * 1024,
  });

runGit(["rev-parse", "--is-inside-work-tree"]);
const head = runGit(["rev-parse", options.ref]).trim();
const records = runGit([
  "log",
  "--first-parent",
  "--reverse",
  "--format=%H%x1f%aI%x1f%s%x1e",
  options.ref,
])
  .split("\x1e")
  .map((record) => record.trim())
  .filter(Boolean)
  .map((record) => {
    const [commit, date, ...subjectParts] = record.split("\x1f");
    return { commit, date, subject: subjectParts.join("\x1f") };
  });

let previousBytes = 0;
let previousFiles = 0;
const states = records.map((record, offset) => {
  const tree = runGit(["ls-tree", "-r", "-l", "-z", record.commit], "buffer");
  let bytes = 0;
  let files = 0;
  for (const entry of tree.toString("utf8").split("\0")) {
    if (!entry) continue;
    const metadata = entry.slice(0, entry.indexOf("\t"));
    const fields = metadata.trim().split(/\s+/);
    const size = fields[3];
    files += 1;
    if (size && size !== "-") bytes += Number(size);
  }

  const state = {
    ordinal: offset + 1,
    commit: record.commit,
    shortCommit: record.commit.slice(0, 7),
    date: record.date,
    subject: record.subject,
    files,
    bytes,
    kib: Number((bytes / 1024).toFixed(3)),
    deltaBytes: offset === 0 ? bytes : bytes - previousBytes,
    deltaFiles: offset === 0 ? files : files - previousFiles,
  };
  previousBytes = bytes;
  previousFiles = files;
  return state;
});

if (states.length === 0) {
  throw new Error(`No first-parent history found for ${options.ref}`);
}

const first = states[0];
const last = states.at(-1);
const largestGrowth = states.reduce((winner, state) =>
  state.deltaBytes > winner.deltaBytes ? state : winner,
);
const largestReduction = states.reduce((winner, state) =>
  state.deltaBytes < winner.deltaBytes ? state : winner,
);

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  metric: {
    name: "tracked_blob_bytes",
    unit: "bytes",
    kibDivisor: 1024,
    definition:
      "Sum of numeric blob sizes reported by git ls-tree -r -l for every first-parent commit. Gitlinks count as tracked entries with zero blob bytes.",
  },
  repository: {
    label: options.label || basename(repositoryPath),
    ref: options.ref,
    head,
  },
  summary: {
    stateCount: states.length,
    first,
    last,
    growthBytes: last.bytes - first.bytes,
    growthPercent: Number((((last.bytes - first.bytes) / first.bytes) * 100).toFixed(3)),
    largestGrowth,
    largestReduction,
  },
  states,
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (options.out) {
  writeFileSync(resolve(options.out), serialized);
} else {
  process.stdout.write(serialized);
}
