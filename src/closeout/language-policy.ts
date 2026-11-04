/**
 * Language-policy detector family (`language_policy`).
 *
 * A repository may declare which languages it forbids in
 * `.mister-clean/language-policy.json`:
 *
 *   { "schema": "mister-clean.language-policy/1",
 *     "forbid_extensions": [".py", ".js"],
 *     "allow": ["<glob>"],
 *     "generated": ["<glob>"] }
 *
 * Detection reads the tracked surface only (one bounded Git listing, never a
 * walk): every tracked path whose extension is forbidden and that matches
 * neither `allow` nor `generated` is a `forbidden_language` finding. Paths that
 * match `generated` are counted and listed as `generated_exempt`, never as
 * findings, so they stay visible. A root `.lang-guard-allow` file (one glob per
 * line, `#` comments) is read as an additional `allow` source for interop.
 *
 * No policy file means the family is `not_applicable`: there is no built-in
 * forbid list. An unreadable or malformed policy is a typed refusal
 * (`language_policy_invalid`), never a silent pass.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

import { trackedShippablePaths } from "./repository.js";

export const LANGUAGE_POLICY_PATH = ".mister-clean/language-policy.json";
export const LANGUAGE_POLICY_SCHEMA = "mister-clean.language-policy/1";
export const LANG_GUARD_ALLOW_PATH = ".lang-guard-allow";

const POLICY_KEYS = new Set(["schema", "forbid_extensions", "allow", "generated"]);
const EXTENSION = /^\.[A-Za-z0-9_+-]+$/u;

export interface LanguagePolicy {
  readonly forbid_extensions: readonly string[];
  readonly allow: readonly string[];
  readonly generated: readonly string[];
}

export interface LanguagePolicyFinding {
  readonly fingerprint: string;
  readonly family: "language_policy";
  readonly rule: "forbidden_language";
  readonly path: string;
  readonly extension: string;
}

export interface LanguagePolicySource {
  readonly path: string;
  readonly sha256: string;
}

export interface LanguagePolicyAuditResult {
  readonly record_type: "mister-clean.language-policy-audit";
  readonly schema_version: "1.0";
  readonly status: "pass" | "fail" | "not_applicable";
  readonly exitCode: 0 | 1;
  /** The declared policy as read, or null when the repository declares none. */
  readonly policy: (LanguagePolicy & {
    readonly source: LanguagePolicySource;
    readonly lang_guard_allow: (LanguagePolicySource & { readonly glob_count: number }) | null;
  }) | null;
  readonly tracked_path_count: number;
  readonly allowed_count: number;
  readonly generated_exempt: { readonly count: number; readonly paths: readonly string[] };
  readonly findings: readonly LanguagePolicyFinding[];
}

export class LanguagePolicyInvalidError extends Error {
  readonly code = "language_policy_invalid";
  constructor(readonly path: string, readonly reason: string) {
    super(`${path}: language policy is invalid: ${reason}`);
    this.name = "LanguagePolicyInvalidError";
  }
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function utf8(bytes: Uint8Array, path: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new LanguagePolicyInvalidError(path, "not valid UTF-8");
  }
}

export function languagePolicyFindingFingerprint(path: string, extension: string): string {
  return sha256(`language_policy\0forbidden_language\0${path}\0${extension}`);
}

function stringList(value: unknown, key: string, required: boolean): string[] {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value)) throw new LanguagePolicyInvalidError(LANGUAGE_POLICY_PATH, `${key} must be an array of strings`);
  for (const entry of value) {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw new LanguagePolicyInvalidError(LANGUAGE_POLICY_PATH, `${key} entries must be nonempty strings`);
    }
  }
  return [...new Set(value as string[])];
}

/** Parse and validate a policy document; throws `LanguagePolicyInvalidError`. */
export function parseLanguagePolicy(text: string): LanguagePolicy {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new LanguagePolicyInvalidError(LANGUAGE_POLICY_PATH, "not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new LanguagePolicyInvalidError(LANGUAGE_POLICY_PATH, "expected a JSON object");
  }
  const record = parsed as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter((key) => !POLICY_KEYS.has(key)).sort();
  if (unknownKeys.length > 0) throw new LanguagePolicyInvalidError(LANGUAGE_POLICY_PATH, `unknown key(s): ${unknownKeys.join(", ")}`);
  if (record.schema !== LANGUAGE_POLICY_SCHEMA) {
    throw new LanguagePolicyInvalidError(LANGUAGE_POLICY_PATH, `schema must be ${LANGUAGE_POLICY_SCHEMA}`);
  }
  const forbid = stringList(record.forbid_extensions, "forbid_extensions", true);
  if (forbid.length === 0) throw new LanguagePolicyInvalidError(LANGUAGE_POLICY_PATH, "forbid_extensions must not be empty");
  const malformed = forbid.filter((extension) => !EXTENSION.test(extension));
  if (malformed.length > 0) {
    throw new LanguagePolicyInvalidError(LANGUAGE_POLICY_PATH, `forbid_extensions entries must look like ".ext": ${malformed.join(", ")}`);
  }
  return {
    forbid_extensions: [...new Set(forbid.map((extension) => extension.toLowerCase()))].sort(),
    allow: stringList(record.allow, "allow", false),
    generated: stringList(record.generated, "generated", false),
  };
}

/** `.lang-guard-allow`: one glob per line; blank lines and `#` comments ignored. */
export function parseLangGuardAllow(text: string): string[] {
  return [...new Set(text.split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#")))];
}

function regexLiteral(character: string): string {
  return /[\\^$.*+?()[\]{}|/]/u.test(character) ? `\\${character}` : character;
}

/** Repository-relative POSIX glob: `**` crosses directories, `*` and `?` do not. */
export function globMatcher(pattern: string): RegExp {
  const portable = pattern.replace(/^\.\//u, "");
  let result = "^";
  for (let index = 0; index < portable.length; index += 1) {
    const character = portable[index] ?? "";
    if (character === "*" && portable[index + 1] === "*") {
      index += 1;
      if (portable[index + 1] === "/") {
        index += 1;
        result += "(?:.*/)?";
      } else result += ".*";
    } else if (character === "*") result += "[^/]*";
    else if (character === "?") result += "[^/]";
    else result += regexLiteral(character);
  }
  // A bare directory pattern (`dir/`) covers everything beneath it.
  if (portable.endsWith("/")) result += ".*";
  return new RegExp(`${result}$`, "u");
}

function anyMatch(matchers: readonly RegExp[], path: string): boolean {
  return matchers.some((matcher) => matcher.test(path));
}

/** The paths the family examines: the tracked, extant surface; never a walk. */
export function languagePolicyCandidatePaths(root: string): string[] {
  return trackedShippablePaths(root);
}

/** Run the language-policy family against `root`. */
export function auditLanguagePolicy(root: string): LanguagePolicyAuditResult {
  const policyPath = join(root, LANGUAGE_POLICY_PATH);
  const empty = {
    record_type: "mister-clean.language-policy-audit",
    schema_version: "1.0",
    allowed_count: 0,
    generated_exempt: { count: 0, paths: [] },
    findings: [],
  } as const;
  if (!existsSync(policyPath)) {
    return { ...empty, status: "not_applicable", exitCode: 0, policy: null, tracked_path_count: 0 };
  }
  let bytes: Uint8Array;
  try {
    bytes = readFileSync(policyPath);
  } catch {
    throw new LanguagePolicyInvalidError(LANGUAGE_POLICY_PATH, "unreadable");
  }
  const policy = parseLanguagePolicy(utf8(bytes, LANGUAGE_POLICY_PATH));
  const langGuardPath = join(root, LANG_GUARD_ALLOW_PATH);
  let langGuard: (LanguagePolicySource & { readonly glob_count: number }) | null = null;
  let langGuardGlobs: string[] = [];
  if (existsSync(langGuardPath)) {
    const langGuardBytes = readFileSync(langGuardPath);
    langGuardGlobs = parseLangGuardAllow(utf8(langGuardBytes, LANG_GUARD_ALLOW_PATH));
    langGuard = { path: LANG_GUARD_ALLOW_PATH, sha256: sha256(langGuardBytes), glob_count: langGuardGlobs.length };
  }
  const allow = [...policy.allow, ...langGuardGlobs].map(globMatcher);
  const generated = policy.generated.map(globMatcher);
  const forbidden = new Set(policy.forbid_extensions);
  const tracked = languagePolicyCandidatePaths(root);
  const findings: LanguagePolicyFinding[] = [];
  const generatedPaths: string[] = [];
  let allowedCount = 0;
  for (const path of tracked) {
    const extension = posix.extname(path).toLowerCase();
    if (!forbidden.has(extension)) continue;
    if (anyMatch(generated, path)) generatedPaths.push(path);
    else if (anyMatch(allow, path)) allowedCount += 1;
    else {
      findings.push({
        fingerprint: languagePolicyFindingFingerprint(path, extension),
        family: "language_policy",
        rule: "forbidden_language",
        path,
        extension,
      });
    }
  }
  return {
    ...empty,
    status: findings.length > 0 ? "fail" : "pass",
    exitCode: findings.length > 0 ? 1 : 0,
    policy: {
      ...policy,
      source: { path: LANGUAGE_POLICY_PATH, sha256: sha256(bytes) },
      lang_guard_allow: langGuard,
    },
    tracked_path_count: tracked.length,
    allowed_count: allowedCount,
    generated_exempt: { count: generatedPaths.length, paths: generatedPaths },
    findings,
  };
}
