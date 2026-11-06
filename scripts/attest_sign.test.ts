/**
 * Proof 1 of charter/DONE/sem-executable-attestation.md: signer round-trip,
 * tamper detection and the no-key refusal. Every key here is a throwaway
 * generated inside the test; no real attestation material is read.
 */
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, verify } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { canonicalJson } from "../src/canonical-json.js";
import { sha256Bytes } from "../src/canonical-digest.js";
import { KEY_ID_ENV, PRIVATE_KEY_ENV, loadPrivateKey, runAttestSign, signAttestation } from "./attest_sign.js";

const SCRIPT = resolve(fileURLToPath(import.meta.url), "..", "attest_sign.ts");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), "mister-clean-attest-sign-"));
  roots.push(root);
  return root;
}

function throwawayKey(): { readonly privatePem: string; readonly publicPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privatePem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
}

function unsignedFixture(keyId = "test-key-1"): Record<string, unknown> {
  const ref = { captured_at: "2026-11-04T00:01:00Z", media_type: "text/plain", path: "case/stdout.txt", sha256: "a".repeat(64), store: "evidence_bundle" };
  return {
    record_type: "mister-clean.semantic-attestation",
    schema_version: "2.0",
    attested_at: "2026-11-04T00:02:00Z",
    attester: { actor_id: "qa-seat", independence_policy_sha256: "b".repeat(64), key_id: keyId, role: "independent_qa" },
    binding: {
      candidate_id: "c".repeat(64), challenge_nonce: "nonce-1", evidence_root_sha256: "d".repeat(64), observations_sha256: "e".repeat(64),
      plan_sha256: "f".repeat(64), repository_object_sha256: "0".repeat(64), run_id: "run-1",
    },
    judgments: [{ case_id: "case-1", disposition: "supports", evidence_refs: [ref], rationale: "observed output matches the intent" }],
    scope: { case_plan_adequacy: "adequate", limitations: [] },
  };
}

function collect(): { readonly io: { stdout: (line: string) => void; stderr: (line: string) => void }; readonly stdout: string[]; readonly stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { io: { stdout: (line) => stdout.push(line), stderr: (line) => stderr.push(line) }, stdout, stderr };
}

describe("attest_sign: signer round-trip, tamper and no-key refusal", () => {
  it("signs canonicalJson(unsigned) so the signature verifies with the public key over the library's bytes", () => {
    const key = throwawayKey();
    const unsigned = unsignedFixture();

    const signed = signAttestation(unsigned, loadPrivateKey(key.privatePem), "test-key-1");

    const { signature, ...payloadRecord } = signed.record;
    const payload = canonicalJson(payloadRecord);
    expect(payload).toBe(canonicalJson(unsigned));
    expect(signature).toMatchObject({ algorithm: "Ed25519", key_id: "test-key-1", signed_payload_sha256: sha256Bytes(payload) });
    expect(verify(null, Buffer.from(payload), key.publicPem, Buffer.from(signature.signature_base64url, "base64url"))).toBe(true);
  });

  it("fails verification after one byte of the signed payload changes", () => {
    const key = throwawayKey();
    const signed = signAttestation(unsignedFixture(), loadPrivateKey(key.privatePem), "test-key-1");
    const { signature, ...payloadRecord } = signed.record;
    const tampered = canonicalJson({ ...payloadRecord, binding: { ...(payloadRecord.binding as Record<string, unknown>), repository_object_sha256: `1${"0".repeat(63)}` } });

    expect(sha256Bytes(tampered)).not.toBe(signature.signed_payload_sha256);
    expect(verify(null, Buffer.from(tampered), key.publicPem, Buffer.from(signature.signature_base64url, "base64url"))).toBe(false);
  });

  it("refuses with a typed message and exit 2 when the private key environment variable is absent, before reading the input", () => {
    const output = collect();

    const code = runAttestSign(["/nonexistent/in.json", "/nonexistent/out.json"], { PATH: "/usr/bin" }, output.io);

    expect(code).toBe(2);
    expect(output.stderr).toEqual([`attest_sign: ${PRIVATE_KEY_ENV} is not set (private_key_missing)`]);
    expect(output.stdout).toEqual([]);
  });

  it("refuses a record whose attester.key_id differs from the signing key id, and a record with placeholders", () => {
    const key = loadPrivateKey(throwawayKey().privatePem);
    expect(() => signAttestation(unsignedFixture("other-key"), key, "test-key-1")).toThrow(/key_id does not equal/u);
    const placeholder = { ...unsignedFixture(), scope: { case_plan_adequacy: "<FILL: adequate | inadequate | inconclusive>", limitations: [] } };
    expect(() => signAttestation(placeholder, key, "test-key-1")).toThrow(/placeholder/u);
  });

  it("runs end to end under bun with the key only in the environment, prints no key material, and refuses to overwrite", () => {
    const key = throwawayKey();
    const root = scratch();
    const input = join(root, "unsigned.json");
    const output = join(root, "signed.json");
    writeFileSync(input, `${JSON.stringify(unsignedFixture())}\n`);
    const env = { ...process.env, [PRIVATE_KEY_ENV]: key.privatePem, [KEY_ID_ENV]: "test-key-1" };

    const stdout = execFileSync("bun", [SCRIPT, input, output], { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] });

    const signed = JSON.parse(readFileSync(output, "utf8")) as { signature: { signature_base64url: string; signed_payload_sha256: string }; [key: string]: unknown };
    const { signature, ...payloadRecord } = signed;
    expect(verify(null, Buffer.from(canonicalJson(payloadRecord)), key.publicPem, Buffer.from(signature.signature_base64url, "base64url"))).toBe(true);
    expect(stdout).toContain(`signed_payload_sha256=${signature.signed_payload_sha256}`);
    expect(stdout).not.toContain("PRIVATE KEY");
    expect(stdout).not.toContain(key.privatePem.split("\n")[1]?.slice(0, 16) ?? "never");
    expect(readFileSync(output, "utf8")).not.toContain("PRIVATE KEY");
    expect(() => execFileSync("bun", [SCRIPT, input, output], { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] })).toThrow(/output path already exists/u);
  });
});
