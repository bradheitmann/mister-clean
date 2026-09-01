import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertActionHygieneProcessCensus,
  captureActionHygiene,
  deriveActionHygieneDelta,
  successorProcessRows,
  type ActionHygieneProcessPort,
  type RawProcessObservation,
  type RawProcessPathObservation,
} from "./action-hygiene.js";

const roots: string[] = [];

function git(repository: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function fixture(name: string): string {
  const repository = mkdtempSync(join(tmpdir(), `mister-clean-action-hygiene-${name}-`));
  roots.push(repository);
  git(repository, "init", "-q", "-b", "main");
  git(repository, "config", "user.name", "Action Hygiene Test");
  git(repository, "config", "user.email", "action-hygiene.invalid");
  writeFileSync(join(repository, ".gitignore"), "ignored.log\ncache/\n", "utf8");
  writeFileSync(join(repository, "tracked.txt"), "baseline\n", "utf8");
  git(repository, "add", ".gitignore", "tracked.txt");
  git(repository, "commit", "-qm", "fixture");
  return repository;
}

function processes(
  repository: string,
  extra: readonly RawProcessObservation[] = [],
  overrides: ReadonlyMap<number, RawProcessPathObservation> = new Map(),
): ActionHygieneProcessPort {
  const rows: RawProcessObservation[] = [
    { pid: 1, ppid: 0, start_identity: "root-start", executable: "/sbin/init" },
    { pid: 100, ppid: 1, start_identity: "invocation-start", executable: "/usr/bin/node" },
    ...extra,
  ];
  return {
    processTable: () => rows,
    pathTable: () => new Map<number, RawProcessPathObservation>([
      [1, { cwd: "/", open_paths: [] }],
      [100, { cwd: repository, open_paths: [] }],
      ...extra.map((row) => [row.pid, overrides.get(row.pid) ?? { cwd: repository, open_paths: [] }] as const),
    ]),
  };
}

function capture(repository: string, processPort = processes(repository)) {
  return captureActionHygiene(repository, { currentPid: 100, processPort });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("action hygiene capture", () => {
  it("captures NUL-safe status rows and canonical digests", () => {
    const repository = fixture("status");
    const path = "odd\nname.txt";
    writeFileSync(join(repository, path), "untracked\n", "utf8");

    const snapshot = capture(repository);

    expect(snapshot.git.worktrees[0]?.status.rows).toContainEqual(expect.objectContaining({
      kind: "untracked",
      path,
    }));
    expect(snapshot.git.state_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.processes.status).toBe("complete");
    expect(snapshot.snapshot_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("distinguishes invocation ancestry from unestablished repository processes", () => {
    const repository = fixture("process-classification");
    const extra = { pid: 200, ppid: 1, start_identity: "other-start", executable: "/usr/bin/other" };

    const snapshot = capture(repository, processes(repository, [extra]));

    expect(snapshot.processes.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ identity: expect.objectContaining({ pid: 100 }), classification: "current_invocation_ancestry" }),
      expect.objectContaining({ identity: expect.objectContaining({ pid: 200 }), classification: "unestablished" }),
    ]));
  });

  it("includes a process whose cwd is elsewhere but an open descriptor touches the repository", () => {
    const repository = fixture("process-open-path");
    const extra = { pid: 200, ppid: 1, start_identity: "other-start", executable: "/usr/bin/other" };
    const external = processes(repository, [extra], new Map([[200, {
      cwd: tmpdir(),
      open_paths: [join(repository, "tracked.txt"), join(tmpdir(), "unrelated.txt")],
    }]]));

    const snapshot = capture(repository, external);

    expect(snapshot.processes.rows).toContainEqual(expect.objectContaining({
      classification: "unestablished",
      identity: expect.objectContaining({
        pid: 200,
        cwd: realpathSync(tmpdir()),
        relevant_open_paths: [realpathSync(join(repository, "tracked.txt"))],
      }),
    }));
  });

  it("does not classify an unrelated external cwd or open path as repository-relevant", () => {
    const repository = fixture("process-external-path");
    const extra = { pid: 200, ppid: 1, start_identity: "other-start", executable: "/usr/bin/other" };
    const external = processes(repository, [extra], new Map([[200, {
      cwd: tmpdir(),
      open_paths: [join(tmpdir(), "unrelated.txt")],
    }]]));

    const snapshot = capture(repository, external);

    expect(snapshot.processes.rows.some((row) => row.identity.pid === 200)).toBe(false);
  });

  it("records unavailable process census support instead of returning empty success", () => {
    const repository = fixture("process-unsupported");
    const unsupported: ActionHygieneProcessPort = {
      processTable: () => { throw new Error("process adapter unavailable"); },
      pathTable: () => new Map(),
    };

    const snapshot = capture(repository, unsupported);

    expect(snapshot.processes.status).toBe("unsupported");
    expect(snapshot.processes.rows).toEqual([]);
    expect(snapshot.processes.errors).toEqual(["process adapter unavailable"]);
  });

  it("projects every non-invocation process, and an incomplete census, as blocking successor residue", () => {
    const repository = fixture("process-successor-projection");
    const extra = { pid: 200, ppid: 1, start_identity: "other-start", executable: "/usr/bin/other" };
    const complete = capture(repository, processes(repository, [extra])).processes;
    const unsupported: ActionHygieneProcessPort = {
      processTable: () => { throw new Error("process adapter unavailable"); },
      pathTable: () => new Map(),
    };
    const incomplete = capture(repository, unsupported).processes;

    expect(successorProcessRows(complete)).toEqual([
      expect.objectContaining({ owner: null, blocking: true }),
    ]);
    expect(successorProcessRows(incomplete)).toEqual([
      expect.objectContaining({
        identity: expect.stringMatching(/^process-census:unsupported:/),
        owner: null,
        blocking: true,
      }),
    ]);
  });

  it("rejects a tampered process census before it can drive successor readiness", () => {
    const repository = fixture("process-census-tamper");
    const census = capture(repository).processes;

    expect(() => assertActionHygieneProcessCensus({ ...census, current_pid: 999 })).toThrow(/state_sha256 mismatch/);
  });
});

describe("deriveActionHygieneDelta", () => {
  it("permits the primary branch ref advancing exactly to the new HEAD", () => {
    const repository = fixture("primary-advance");
    const before = capture(repository);
    writeFileSync(join(repository, "tracked.txt"), "changed\n", "utf8");
    git(repository, "add", "tracked.txt");
    git(repository, "commit", "-qm", "advance");
    const after = capture(repository);

    const delta = deriveActionHygieneDelta(before, after, "main");

    expect(delta.repository_object_changed).toBe(true);
    expect(delta.violations).toEqual([]);
  });

  it("rejects stash creation", () => {
    const repository = fixture("stash");
    const before = capture(repository);
    writeFileSync(join(repository, "tracked.txt"), "stashed\n", "utf8");
    git(repository, "stash", "push", "-qm", "test stash");
    const after = capture(repository);

    const delta = deriveActionHygieneDelta(before, after, "main");

    expect(delta.violations.map((row) => row.code)).toContain("stash_changed");
  });

  it("rejects changes to refs other than the primary branch", () => {
    const repository = fixture("other-ref");
    const before = capture(repository);
    git(repository, "branch", "side");
    const after = capture(repository);

    const delta = deriveActionHygieneDelta(before, after, "main");

    expect(delta.violations).toContainEqual(expect.objectContaining({
      code: "unexpected_ref_change",
      key: "refs/heads/side",
    }));
  });

  it("rejects worktree topology changes", () => {
    const repository = fixture("worktree");
    const before = capture(repository);
    const linked = `${repository}-linked`;
    roots.push(linked);
    git(repository, "worktree", "add", "-q", "-b", "linked", linked);
    const after = capture(repository);

    const delta = deriveActionHygieneDelta(before, after, "main");

    expect(delta.violations.map((row) => row.code)).toContain("worktree_topology_changed");
  });

  it("rejects ignored debris additions but permits removals", () => {
    const repository = fixture("ignored");
    const clean = capture(repository);
    writeFileSync(join(repository, "ignored.log"), "debris\n", "utf8");
    mkdirSync(join(repository, "cache"));
    writeFileSync(join(repository, "cache", "item.bin"), "cache\n", "utf8");
    const dirty = capture(repository);

    const added = deriveActionHygieneDelta(clean, dirty, "main");
    const removed = deriveActionHygieneDelta(dirty, clean, "main");

    expect(added.violations.map((row) => row.code)).toContain("ignored_path_added");
    expect(removed.violations).toEqual([]);
  });

  it("rejects Git lock-path changes", () => {
    const repository = fixture("lock");
    const before = capture(repository);
    writeFileSync(join(repository, ".git", "custom.lock"), "lock\n", "utf8");
    const after = capture(repository);

    const delta = deriveActionHygieneDelta(before, after, "main");

    expect(delta.violations.map((row) => row.code)).toContain("git_control_changed");
  });

  it("rejects an added unestablished process while allowing process disappearance", () => {
    const repository = fixture("process-delta");
    const extra = { pid: 200, ppid: 1, start_identity: "other-start", executable: "/usr/bin/other" };
    const without = capture(repository);
    const withExtra = capture(repository, processes(repository, [extra]));

    const added = deriveActionHygieneDelta(without, withExtra, "main");
    const removed = deriveActionHygieneDelta(withExtra, without, "main");

    expect(added.violations).toContainEqual(expect.objectContaining({
      code: "unestablished_process_added",
      key: "200:other-start",
    }));
    expect(removed.violations).toEqual([]);
  });

  it("rejects an added process that touches the repository only through an open descriptor", () => {
    const repository = fixture("process-open-path-delta");
    const extra = { pid: 200, ppid: 1, start_identity: "other-start", executable: "/usr/bin/other" };
    const external = processes(repository, [extra], new Map([[200, {
      cwd: tmpdir(),
      open_paths: [join(repository, "tracked.txt")],
    }]]));

    const before = capture(repository);
    const after = capture(repository, external);
    const delta = deriveActionHygieneDelta(before, after, "main");

    expect(delta.violations).toContainEqual(expect.objectContaining({
      code: "unestablished_process_added",
      key: "200:other-start",
    }));
  });
});
