import { describe, expect, it } from "vitest";

import { translateLegacyDispatch } from "./legacy-dispatch.js";
import { canonicalJson, sha256Bytes } from "../runtime/authority.js";
import { legacyDispatchBridgeRecordSchema, parseImportSchema } from "../contracts/import-provenance.js";

const census = canonicalJson({
  record_type: "mister-clean.repository-census", schema_version: "1.0", repository_object_sha256: "2".repeat(64),
  entries: [{ repository_relative_path: "history/dispatch.json", tracking_state: "tracked", declared_artifact_role: "machine_contract" }],
});

const source = {
  source_class: "tracked_machine_contract" as const,
  trust_tier: "first_party" as const,
  kind: "dispatch_record" as const,
  census_evidence: {
    census_sha256: sha256Bytes(census), repository_object_sha256: "2".repeat(64), repository_relative_path: "history/dispatch.json",
    tracking_state: "tracked" as const, declared_artifact_role: "machine_contract" as const,
  },
  locator: {
    repository_relative_path: "history/dispatch.json",
  },
};

const parser = {
  parser_identity: "historical-import",
  parser_version: "1.0.0",
  extraction_rule: "exact-field-extraction",
  confidence: 1,
};

describe("legacy dispatch translation", () => {
  it("lists missing manifest fields instead of coercing an incomplete dispatch record", () => {
    const legacyRecord = {
      manifest_id: "manifest-1",
      revision: 1,
      target_ref: "refs/heads/main",
    };
    const bridge = translateLegacyDispatch({
      source,
      parser,
      legacy_schema_version: "0.9",
      legacy_record: legacyRecord,
      legacy_bytes: canonicalJson(legacyRecord),
      census_bytes: census,
    });
    expect(bridge.complete).toBe(false);
    expect(bridge.missing_fields).toContain("record_type");
    expect(bridge.missing_fields).toContain("authority_mode");
    expect(bridge.derived_fields.find((entry) => entry.field === "manifest_id")?.value).toBe("manifest-1");
  });

  it("never accepts a self-asserted complete bridge", () => {
    const legacyRecord = { manifest_id: "manifest-1" };
    const bridge = translateLegacyDispatch({ source, parser, legacy_record: legacyRecord, legacy_bytes: canonicalJson(legacyRecord), census_bytes: census });
    expect(bridge.complete).toBe(false);
    expect(() => parseImportSchema(legacyDispatchBridgeRecordSchema, { ...bridge, complete: true }, "bridge")).toThrow(/completeness|complete/i);
  });
});
