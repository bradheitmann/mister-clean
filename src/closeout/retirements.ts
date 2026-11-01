/**
 * Committed rulings that change how the debt census reads.
 *
 * Two inputs live here, both read from the repository under closeout:
 *
 * - `charter/retirements/<date>-<slug>.json` retires a legacy local corpus. One
 *   ruling covers the hundreds of debts under an ignored planning directory that
 *   nobody is going to repair one at a time. The record is not the ruling: it
 *   cites one (a committed file with a matching digest), so an agent cannot
 *   ratify its own exemption.
 * - `charter/public-safety-exemptions/<date>-<slug>.json` marks a deliberate
 *   synthetic fixture string (an example address, a `/Users/example` path) so it
 *   stays visible in the census as exempt instead of minting debt. Entries are
 *   keyed to the exact finding: file, rule and the digest of the matched value,
 *   so a new string in the same file still counts.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, normalize, resolve, sep } from "node:path";

import { array, object, type JsonObject } from "./bundle-runtime.js";
import { isoTimestamp, nonempty } from "./records.js";

export const RETIREMENT_RECORD_TYPE = "mister-clean.retirement";
export const RETIREMENT_SCHEMA_VERSION = "1.0";
export const RETIREMENT_DIRECTORY = "charter/retirements";
export const PUBLIC_SAFETY_EXEMPTION_RECORD_TYPE = "mister-clean.public-safety-exemption";
export const PUBLIC_SAFETY_EXEMPTION_SCHEMA_VERSION = "1.0";
export const PUBLIC_SAFETY_EXEMPTION_DIRECTORY = "charter/public-safety-exemptions";

/** Debt classes that stay payable whatever a ruling says (records.ts enforces the same rule). */
const PAYABLE_CLASSES = new Set(["stale-remediation-record", "stale_doc_or_comment"]);

export interface RetirementRuling {
  readonly author: string;
  readonly at: string;
  readonly scope: string;
  readonly evidence: { readonly path: string; readonly sha256: string };
}

export interface RetirementRecord {
  readonly record_path: string;
  readonly slug: string;
  readonly roots: readonly string[];
  readonly ruling: RetirementRuling;
}

export interface RetirementApplication {
  readonly record_path: string;
  readonly slug: string;
  readonly root: string;
  readonly debt_ids: readonly string[];
}

export interface PublicSafetyExemptionEntry {
  readonly record_path: string;
  readonly file: string;
  readonly rule: string;
  readonly value_sha256: string;
  readonly rationale: string;
}

/** A refusal: the input is present but not usable, and closeout stops rather than guessing. */
export class CensusInputRefused extends Error {
  constructor(readonly refusals: readonly string[]) {
    super(`closeout census input refused: ${refusals.join("; ")}`);
    this.name = "CensusInputRefused";
  }
}

function normalizeRepositoryPath(value: unknown): string | undefined {
  if (!nonempty(value)) return undefined;
  const raw = value.replaceAll("\\", "/");
  if (isAbsolute(value) || raw.startsWith("/") || /^[a-zA-Z]:/u.test(raw)) return undefined;
  const normalized = normalize(raw).split(sep).join("/");
  if (normalized === "." || normalized === "" || normalized === ".." || normalized.startsWith("../")) return undefined;
  return normalized;
}

function isUnder(subject: string, root: string): boolean {
  return subject === root || subject.startsWith(`${root}/`);
}

function censusInputPaths(repository: string, directory: string): string[] {
  const absolute = join(repository, directory);
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) return [];
  return readdirSync(absolute)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => `${directory}/${name}`);
}

function readJsonRecord(repository: string, relativePath: string, refusals: string[]): JsonObject | undefined {
  const absolute = join(repository, relativePath);
  try {
    const parsed: unknown = JSON.parse(readFileSync(absolute, "utf8"));
    const record = object(parsed);
    if (!record) refusals.push(`${relativePath}: expected a JSON object`);
    return record;
  } catch (error) {
    refusals.push(`${relativePath}: cannot be read as JSON (${error instanceof Error ? error.message : String(error)})`);
    return undefined;
  }
}

function sha256FileBytes(absolute: string): string {
  return createHash("sha256").update(readFileSync(absolute)).digest("hex");
}

/**
 * Read and validate every committed retirement record.
 *
 * Refused: an unreadable record, a missing ruling file, a ruling digest that no
 * longer matches, a record that cites another retirement as its ruling, a root
 * that is absolute or escapes the repository, and a record with no author, date
 * or scope.
 */
export function readRetirements(repository: string): RetirementRecord[] {
  const refusals: string[] = [];
  const records: RetirementRecord[] = [];
  for (const relativePath of censusInputPaths(repository, RETIREMENT_DIRECTORY)) {
    const record = readJsonRecord(repository, relativePath, refusals);
    if (!record) continue;
    if (record.record_type !== RETIREMENT_RECORD_TYPE) {
      refusals.push(`${relativePath}: record_type must be ${RETIREMENT_RECORD_TYPE}`);
      continue;
    }
    if (record.schema_version !== RETIREMENT_SCHEMA_VERSION) {
      refusals.push(`${relativePath}: schema_version must be ${RETIREMENT_SCHEMA_VERSION}`);
      continue;
    }
    if (!nonempty(record.slug)) refusals.push(`${relativePath}: slug is required`);
    const roots = array(record.roots);
    if (!roots || roots.length === 0) {
      refusals.push(`${relativePath}: roots must list at least one repository-relative path`);
      continue;
    }
    const normalizedRoots: string[] = [];
    for (const root of roots) {
      const normalized = normalizeRepositoryPath(root);
      if (!normalized) {
        refusals.push(`${relativePath}: root ${JSON.stringify(root)} must be a repository-relative path inside the repository`);
        continue;
      }
      normalizedRoots.push(normalized);
    }
    if (normalizedRoots.length !== roots.length) continue;
    const ruling = object(record.ruling);
    if (!ruling) {
      refusals.push(`${relativePath}: ruling is required (this record cites a ruling, it is not one)`);
      continue;
    }
    if (!nonempty(ruling.author)) refusals.push(`${relativePath}: ruling.author is required`);
    if (!isoTimestamp(ruling.at)) refusals.push(`${relativePath}: ruling.at must be a timezone-aware ISO-8601 timestamp`);
    if (!nonempty(ruling.scope)) refusals.push(`${relativePath}: ruling.scope is required`);
    const evidence = object(ruling.evidence);
    const evidencePath = normalizeRepositoryPath(evidence?.path);
    if (!evidence || !evidencePath) {
      refusals.push(`${relativePath}: ruling.evidence.path must name a repository-relative ruling file`);
      continue;
    }
    if (typeof evidence.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(evidence.sha256)) {
      refusals.push(`${relativePath}: ruling.evidence.sha256 must be a lowercase SHA-256`);
      continue;
    }
    if (isUnder(evidencePath, RETIREMENT_DIRECTORY)) {
      refusals.push(`${relativePath}: ruling.evidence.path must cite the ruling, not another retirement record`);
      continue;
    }
    const evidenceAbsolute = resolve(repository, evidencePath);
    if (!isUnderText(evidenceAbsolute, resolve(repository))) {
      refusals.push(`${relativePath}: ruling.evidence.path escapes the repository`);
      continue;
    }
    if (!existsSync(evidenceAbsolute) || !statSync(evidenceAbsolute).isFile()) {
      refusals.push(`${relativePath}: ruling.evidence.path ${JSON.stringify(evidencePath)} does not exist`);
      continue;
    }
    const observed = sha256FileBytes(evidenceAbsolute);
    if (observed !== evidence.sha256) {
      refusals.push(`${relativePath}: ruling.evidence.sha256 does not match ${JSON.stringify(evidencePath)} (record ${evidence.sha256}, file ${observed})`);
      continue;
    }
    records.push({
      record_path: relativePath,
      slug: String(record.slug),
      roots: [...new Set(normalizedRoots)].sort(),
      ruling: {
        author: String(ruling.author),
        at: String(ruling.at),
        scope: String(ruling.scope),
        evidence: { path: evidencePath, sha256: evidence.sha256 },
      },
    });
  }
  if (refusals.length > 0) throw new CensusInputRefused(refusals);
  return records;
}

function isUnderText(absolute: string, root: string): boolean {
  const normalizedRoot = root.endsWith(sep) ? root : `${root}${sep}`;
  return absolute === root || absolute.startsWith(normalizedRoot);
}

/**
 * Turn every debt whose subject lies under a retired root into one accepted
 * exception, filling the exception fields from the ruling. Debts outside the
 * roots, and debts that stay payable whatever a ruling says, are untouched.
 */
export function applyRetirements(
  debts: readonly JsonObject[],
  records: readonly RetirementRecord[],
): { debts: JsonObject[]; applications: RetirementApplication[] } {
  const refusals: string[] = [];
  const applied = new Map<string, RetirementApplication & { debt_ids: string[] }>();
  const next = debts.map((debt) => {
    if (records.length === 0) return debt;
    const paths = (array(debt.affected_paths) ?? [])
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.replaceAll("\\", "/"));
    if (paths.length === 0) return debt;
    for (const record of records) {
      const root = record.roots.find((candidate) => paths.some((path) => isUnder(path, candidate)));
      if (!root) continue;
      if (PAYABLE_CLASSES.has(String(debt.class))) {
        refusals.push(`${record.record_path}: ${String(debt.id)} is ${String(debt.class)}, which stays payable and cannot be retired`);
        continue;
      }
      const key = `${record.record_path}\0${root}`;
      const application = applied.get(key) ?? { record_path: record.record_path, slug: record.slug, root, debt_ids: [] };
      application.debt_ids.push(String(debt.id));
      applied.set(key, application);
      return {
        ...debt,
        state: "accepted_exception",
        disposition: "accepted_exception",
        exception: {
          actor: record.ruling.author,
          at: record.ruling.at,
          ref: record.ruling.evidence,
          scope: `retired root ${root}`,
          rationale: record.ruling.scope,
        },
      };
    }
    return debt;
  });
  if (refusals.length > 0) throw new CensusInputRefused(refusals);
  return { debts: next, applications: [...applied.values()] };
}

/** Read and validate the committed public-safety fixture exemptions. */
export function readPublicSafetyExemptions(repository: string): PublicSafetyExemptionEntry[] {
  const refusals: string[] = [];
  const entries: PublicSafetyExemptionEntry[] = [];
  for (const relativePath of censusInputPaths(repository, PUBLIC_SAFETY_EXEMPTION_DIRECTORY)) {
    const record = readJsonRecord(repository, relativePath, refusals);
    if (!record) continue;
    if (record.record_type !== PUBLIC_SAFETY_EXEMPTION_RECORD_TYPE) {
      refusals.push(`${relativePath}: record_type must be ${PUBLIC_SAFETY_EXEMPTION_RECORD_TYPE}`);
      continue;
    }
    if (record.schema_version !== PUBLIC_SAFETY_EXEMPTION_SCHEMA_VERSION) {
      refusals.push(`${relativePath}: schema_version must be ${PUBLIC_SAFETY_EXEMPTION_SCHEMA_VERSION}`);
      continue;
    }
    const rows = array(record.entries);
    if (!rows || rows.length === 0) {
      refusals.push(`${relativePath}: entries must list at least one exemption`);
      continue;
    }
    for (const [index, raw] of rows.entries()) {
      const entry = object(raw);
      const label = `${relativePath}: entries[${String(index)}]`;
      if (!entry) {
        refusals.push(`${label}: expected an object`);
        continue;
      }
      const file = normalizeRepositoryPath(entry.file);
      if (!file) refusals.push(`${label}.file must be a repository-relative path`);
      if (!nonempty(entry.rule)) refusals.push(`${label}.rule is required`);
      if (typeof entry.value_sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(entry.value_sha256)) {
        refusals.push(`${label}.value_sha256 must be a lowercase SHA-256 of the matched value`);
      }
      if (!nonempty(entry.rationale)) refusals.push(`${label}.rationale is required`);
      if (!file || !nonempty(entry.rule) || typeof entry.value_sha256 !== "string" || !nonempty(entry.rationale)) continue;
      entries.push({
        record_path: relativePath,
        file,
        rule: String(entry.rule),
        value_sha256: entry.value_sha256,
        rationale: String(entry.rationale),
      });
    }
  }
  if (refusals.length > 0) throw new CensusInputRefused(refusals);
  return entries;
}

export interface PublicSafetyExemptionOutcome<T> {
  readonly findings: T[];
  readonly exempted: Array<{ readonly finding: T; readonly entry: PublicSafetyExemptionEntry }>;
}

/**
 * Drop exempted fixture findings from the scan, and refuse an exemption that no
 * longer matches anything: a stale exemption is unreviewed state, not a pass.
 */
export function applyPublicSafetyExemptions<T extends {
  readonly path: string;
  readonly rule: string;
  readonly value_sha256?: string;
}>(findings: readonly T[], entries: readonly PublicSafetyExemptionEntry[]): PublicSafetyExemptionOutcome<T> {
  const kept: T[] = [];
  const exempted: Array<{ finding: T; entry: PublicSafetyExemptionEntry }> = [];
  const used = new Set<PublicSafetyExemptionEntry>();
  for (const finding of findings) {
    const entry = entries.find((candidate) => candidate.file === finding.path.replaceAll("\\", "/")
      && candidate.rule === finding.rule
      && candidate.value_sha256 === finding.value_sha256);
    if (entry) {
      used.add(entry);
      exempted.push({ finding, entry });
      continue;
    }
    kept.push(finding);
  }
  const stale = entries.filter((entry) => !used.has(entry));
  if (stale.length > 0) {
    throw new CensusInputRefused(stale.map((entry) => (
      `${entry.record_path}: exemption for ${entry.rule} in ${entry.file} with value ${entry.value_sha256} matches no current finding (stale)`
    )));
  }
  return { findings: kept, exempted };
}
