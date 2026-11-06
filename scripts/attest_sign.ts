#!/usr/bin/env bun
/**
 * Ed25519 signer for `mister-clean.semantic-attestation` schema 2.0 records.
 *
 * The attester seat runs it only as
 *   doppler run --project mister-clean --config attest -- bun scripts/attest_sign.ts <unsigned.json> <signed.json>
 * so the private key reaches this process through the environment and nothing
 * else. The signed bytes are `canonicalJson(unsigned)`, imported from the same
 * module `src/closeout/semantic-v2.ts` verifies with, so the signature is over
 * exactly the payload the verifier reconstructs. The key is never printed,
 * written, or echoed; stdout carries public facts only.
 */
import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { canonicalJson } from "../src/canonical-json.js";
import { sha256Bytes } from "../src/canonical-digest.js";

export const PRIVATE_KEY_ENV = "MISTER_CLEAN_ATTESTATION_PRIVATE_KEY_PEM";
export const KEY_ID_ENV = "MISTER_CLEAN_ATTESTATION_KEY_ID";

export interface AttestationSignature {
  readonly algorithm: "Ed25519";
  readonly key_id: string;
  readonly signature_base64url: string;
  readonly signed_payload_sha256: string;
}

export interface SignedAttestation {
  readonly record: Record<string, unknown> & { readonly signature: AttestationSignature };
  /** SHA-256 of the signer's public key in SPKI DER form: a public fact, safe to print. */
  readonly public_spki_sha256: string;
}

export class AttestSignError extends Error {
  constructor(readonly code: string, message: string) {
    super(`attest_sign: ${message}`);
    this.name = "AttestSignError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function containsPlaceholder(value: unknown): boolean {
  if (typeof value === "string") return value.startsWith("<FILL");
  if (Array.isArray(value)) return value.some(containsPlaceholder);
  if (isRecord(value)) return Object.values(value).some(containsPlaceholder);
  return false;
}

/** Load the Ed25519 private key from PEM text; refuses any other key type. */
export function loadPrivateKey(pem: string): KeyObject {
  let key: KeyObject;
  try {
    key = createPrivateKey(pem);
  } catch {
    throw new AttestSignError("private_key_invalid", `${PRIVATE_KEY_ENV} is not a readable private key PEM`);
  }
  if (key.asymmetricKeyType !== "ed25519") {
    throw new AttestSignError("private_key_not_ed25519", `${PRIVATE_KEY_ENV} is a ${String(key.asymmetricKeyType)} key; Ed25519 is required`);
  }
  return key;
}

/**
 * Sign one unsigned attestation. Any existing `signature` member is discarded;
 * `key_id` must equal the record's `attester.key_id` so a record cannot be
 * signed under a key it does not claim.
 */
export function signAttestation(unsigned: unknown, privateKey: KeyObject, keyId: string): SignedAttestation {
  if (!isRecord(unsigned) || unsigned.record_type !== "mister-clean.semantic-attestation" || unsigned.schema_version !== "2.0") {
    throw new AttestSignError("record_not_attestation", "input is not a mister-clean.semantic-attestation schema 2.0 record");
  }
  const { signature: _discarded, ...payloadRecord } = unsigned;
  if (containsPlaceholder(payloadRecord)) {
    throw new AttestSignError("placeholder_present", "input still contains a <FILL …> placeholder; the attester must complete every judgment first");
  }
  const attester = payloadRecord.attester;
  if (!isRecord(attester) || attester.key_id !== keyId) {
    throw new AttestSignError("key_id_mismatch", `attester.key_id does not equal the signing key id ${keyId}`);
  }
  const payload = canonicalJson(payloadRecord);
  const payloadBytes = Buffer.from(payload, "utf8");
  const signatureBytes = sign(null, payloadBytes, privateKey);
  // Node derives the public half from a private KeyObject at runtime; the type overloads do not list KeyObject.
  const publicKey = createPublicKey(privateKey as unknown as Parameters<typeof createPublicKey>[0]);
  if (!verify(null, payloadBytes, publicKey, signatureBytes)) {
    throw new AttestSignError("self_verify_failed", "signature did not verify with the key's own public half");
  }
  const signature: AttestationSignature = {
    algorithm: "Ed25519",
    key_id: keyId,
    signature_base64url: Buffer.from(signatureBytes).toString("base64url"),
    signed_payload_sha256: sha256Bytes(payload),
  };
  return {
    public_spki_sha256: createHash("sha256").update(publicKey.export({ format: "der", type: "spki" })).digest("hex"),
    record: { ...payloadRecord, signature },
  };
}

export function runAttestSign(argv: readonly string[], env: NodeJS.ProcessEnv, io: { stdout: (line: string) => void; stderr: (line: string) => void }): number {
  try {
    const pem = env[PRIVATE_KEY_ENV];
    if (pem === undefined || pem.length === 0) {
      throw new AttestSignError("private_key_missing", `${PRIVATE_KEY_ENV} is not set`);
    }
    const [inputArgument, outputArgument] = argv;
    if (!inputArgument || !outputArgument || argv.length !== 2) {
      throw new AttestSignError("usage", "usage: attest_sign.ts <unsigned-attestation.json> <signed-attestation.json>");
    }
    const inputPath = resolve(inputArgument);
    const outputPath = resolve(outputArgument);
    if (inputPath === outputPath) throw new AttestSignError("usage", "output path must differ from the input path");
    if (existsSync(outputPath)) throw new AttestSignError("output_exists", "output path already exists; refusing to overwrite a signed record");
    let unsigned: unknown;
    try {
      unsigned = JSON.parse(readFileSync(inputPath, "utf8")) as unknown;
    } catch {
      throw new AttestSignError("input_unreadable", "input is not readable JSON");
    }
    const privateKey = loadPrivateKey(pem);
    const claimedKeyId = isRecord(unsigned) && isRecord(unsigned.attester) && typeof unsigned.attester.key_id === "string" ? unsigned.attester.key_id : "";
    const keyId = env[KEY_ID_ENV] ?? claimedKeyId;
    if (!keyId) throw new AttestSignError("key_id_missing", `neither ${KEY_ID_ENV} nor attester.key_id names the key`);
    const signed = signAttestation(unsigned, privateKey, keyId);
    writeFileSync(outputPath, `${canonicalJson(signed.record)}\n`, { flag: "wx" });
    io.stdout(`attest_sign: WROTE ${outputPath}`);
    io.stdout(`attest_sign: key_id=${keyId} public_spki_sha256=${signed.public_spki_sha256} signed_payload_sha256=${signed.record.signature.signed_payload_sha256}`);
    return 0;
  } catch (error) {
    if (error instanceof AttestSignError) {
      io.stderr(`${error.message} (${error.code})`);
      return 2;
    }
    io.stderr(`attest_sign: ${error instanceof Error ? error.message : String(error)} (unexpected)`);
    return 2;
  }
}

if ((import.meta as { main?: boolean }).main === true) {
  process.exitCode = runAttestSign(process.argv.slice(2), process.env, {
    stderr: (line) => process.stderr.write(`${line}\n`),
    stdout: (line) => process.stdout.write(`${line}\n`),
  });
}
