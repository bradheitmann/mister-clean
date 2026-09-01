export interface FileRuntimeAttestationBinding {
  readonly record_type: "mister-clean.runtime-attestation-binding";
  readonly schema_version: "1.0";
  readonly status: "pass" | "source_development";
  readonly package_root: string;
  readonly package_root_realpath: string;
  readonly entrypoint: {
    readonly path: string;
    readonly realpath: string;
    readonly sha256: string;
  };
  readonly package?: {
    readonly name: string;
    readonly version: string;
  };
  readonly claimed_source?: {
    readonly git_commit: string;
    readonly git_tag: string;
  };
  readonly claim_scope?: {
    readonly covers: "own_package_regular_file_bytes";
    readonly excludes: readonly [
      "registry_publication_provenance",
      "dependency_resolution_graph",
      "filesystem_mode_bits_xattrs_and_timestamps",
      "release_attestation_self_bytes",
      "claimed_source_authenticity",
    ];
  };
  readonly manifest?: {
    readonly path: "./MANIFEST.sha256";
    readonly format: "sha256sum-v1-lf";
    readonly entry_count: number;
    readonly sha256: string;
  };
  readonly reason?: string;
}

export interface BundledContentAttestationBinding {
  readonly record_type: "mister-clean.runtime-attestation-binding";
  readonly schema_version: "1.0";
  readonly status: "bundled_content";
  readonly package: {
    readonly name: "@bradheitmann/mister-clean";
    readonly version: string;
  };
  readonly bundle: {
    readonly kind: "generated_materials";
    readonly format: "canonical-json-sha256-v1";
    readonly entry_count: number;
    readonly sha256: string;
  };
  readonly claim_scope: "bundled_canonical_material_bytes_only";
  readonly reason: string;
}

export type ServerAttestationBinding =
  | FileRuntimeAttestationBinding
  | BundledContentAttestationBinding;

// A binding is a runtime capability, not a structural interface. The mint is
// internal to shipped entrypoints; package exports never expose it.
const verifiedRuntimeBindings = new WeakSet<object>();

function deepFreeze(value: unknown, seen = new WeakSet<object>()): void {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  Object.freeze(value);
}

export function mintServerAttestationBinding<T extends ServerAttestationBinding>(binding: T): T {
  deepFreeze(binding);
  verifiedRuntimeBindings.add(binding);
  return binding;
}

export function isVerifiedServerAttestationBinding(
  value: unknown,
): value is ServerAttestationBinding {
  return !!value && typeof value === "object" && verifiedRuntimeBindings.has(value);
}
