/**
 * Golden data for src/closeout/prepare.golden.test.ts (charter/DONE/mg-s2e-finding-reducer.md, proof 1).
 * Recorded on main 803fd4c by running the test's capture on the base code. Do not edit by hand:
 * the slice declares no behaviour change, so a difference is a regression, not a new recording.
 * The fixture's temporary root is replaced by <FIXTURE_ROOT>, and each native-gate debt's
 * evidence_ref.sha256 (checked first against that run's native-gate-validation.json) by
 * <NATIVE_GATE_VALIDATION_SHA256>.
 */
export interface PrepareGoldenCapture {
  readonly report: Readonly<Record<string, unknown>>;
  readonly regression_delta_lines: readonly string[];
}

export const PREPARE_GOLDEN: Readonly<Record<string, PrepareGoldenCapture>> = {
  "families": {
    "report": {
      "completion_debts": [
        {
          "id": "DEBT-PLANNING-10EEE80CA89BF42CA54D",
          "class": "body_projection_conflict",
          "observation_count": 1,
          "raw_finding_ids": [
            "RAW-PLANNING-10BF916C44FC5A1247A5"
          ],
          "detector_finding_fingerprints": [
            "3784305a365e50e272322ba35329534bb993dea75a5de43a15a6fe7f3731e48f"
          ],
          "affected_paths": [
            "planning/done/TASK.md"
          ],
          "repair_boundary": "planning/done/TASK.md",
          "causal_evidence": {
            "component_refs": [
              "planning/done/TASK.md"
            ],
            "kind": "single_artifact",
            "violated_invariant": "lifecycle_projection"
          },
          "procedure": "Reconcile lifecycle_projection across planning/done/TASK.md",
          "state": "open",
          "disposition": "autonomously_repair",
          "evidence": [
            {
              "kind": "planning_census",
              "object": "planning:lifecycle_projection:CAUSE-9C817DD013B8AFC41523",
              "command": "mister-clean audit planning . --json",
              "result": "1 raw observations: body_projection_conflict",
              "observed_at": "2026-11-17T00:00:00.000Z",
              "evidence_ref": {
                "path": "planning-audit.json",
                "sha256": "c75c11976429616ba7445dd07bc9c42a6c38c62a101cf7793c5ff5bd79b2403b"
              }
            }
          ],
          "debt_key": "5c215d4ccabcbff2433a0baf2ccda41ab81e6bbd5ff3d0b010433979686ed292",
          "normalizer": "mister-clean/planning-root@1",
          "cause_key": {
            "detector_family": "planning_graph",
            "source_cause_key": "planning:lifecycle_projection:CAUSE-9C817DD013B8AFC41523",
            "repair_boundary": "planning/done/TASK.md"
          },
          "observation_ids": [
            "28c1efefe0d3530448e70c89c226a9562dd7196986555fa831c1463cf1d8da72"
          ],
          "origin": {
            "class": "baseline"
          }
        },
        {
          "id": "DEBT-PUBLIC-SAFETY-B316B0C2730FE055",
          "class": "public_safety_custom-denylist-1",
          "observation_count": 1,
          "detector_finding_fingerprints": [
            "b316b0c2730fe055269883a0f4e392e4039ef6a465f6ca3f86f85c305282c836"
          ],
          "affected_paths": [
            "legacy/notes.md"
          ],
          "repair_boundary": "file:legacy/notes.md:1",
          "procedure": "Remove or remediate the custom-denylist-1 public-safety finding, then rerun the redacted public-safety audit",
          "state": "accepted_exception",
          "disposition": "accepted_exception",
          "evidence": [
            {
              "kind": "public_safety_scan",
              "object": "325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489",
              "command": "mister-clean audit public-safety . --tracked --denylist-file public-safety-denylist.txt --json",
              "result": "public-safety fingerprint b316b0c2730fe055269883a0f4e392e4039ef6a465f6ca3f86f85c305282c836",
              "observed_at": "2026-11-17T00:00:00.000Z",
              "evidence_ref": {
                "path": "public-safety-audit.json",
                "sha256": "21713e534ac9c9c4875e922d619ef6a11d6bb6eb529a1992317309b540bb24d5"
              }
            }
          ],
          "debt_key": "73640a11edff1b74f9cc5a6c5b24bd8b0e222da8f66a43ddf890f4f9efa43299",
          "normalizer": "mister-clean/public-safety-root@1",
          "cause_key": {
            "detector_family": "public_safety",
            "rule": "custom-denylist-1",
            "path": "legacy/notes.md",
            "line": 1
          },
          "observation_ids": [
            "4b6971c632ba74b2758b06454be283684f55fd118fbcf7f3c53313d1453fa4f4"
          ],
          "origin": {
            "class": "baseline"
          },
          "exception": {
            "actor": "operator",
            "at": "2026-11-17T00:00:00Z",
            "ref": {
              "path": "retirement-rulings/DEBT-PUBLIC-SAFETY-B316B0C2730FE055.json",
              "sha256": "5bf623757bd44561ac735c9adb5930c17d624624d853d2c1969f4e97ac6b7b88"
            },
            "scope": "retired root legacy",
            "rationale": "Retire the frozen legacy corpus"
          }
        },
        {
          "id": "DEBT-PUBLIC-SAFETY-8A99834661DFEF6A",
          "class": "public_safety_custom-denylist-1",
          "observation_count": 1,
          "detector_finding_fingerprints": [
            "8a99834661dfef6a064737f40cce22d49680f216a4c4adbf2c4474e7881ce866"
          ],
          "affected_paths": [
            "source.txt"
          ],
          "repair_boundary": "file:source.txt:1",
          "procedure": "Remove or remediate the custom-denylist-1 public-safety finding, then rerun the redacted public-safety audit",
          "state": "open",
          "disposition": "autonomously_repair",
          "evidence": [
            {
              "kind": "public_safety_scan",
              "object": "325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489",
              "command": "mister-clean audit public-safety . --tracked --denylist-file public-safety-denylist.txt --json",
              "result": "public-safety fingerprint 8a99834661dfef6a064737f40cce22d49680f216a4c4adbf2c4474e7881ce866",
              "observed_at": "2026-11-17T00:00:00.000Z",
              "evidence_ref": {
                "path": "public-safety-audit.json",
                "sha256": "21713e534ac9c9c4875e922d619ef6a11d6bb6eb529a1992317309b540bb24d5"
              }
            }
          ],
          "debt_key": "fb9abbe9e9a1f404a2f96d17fc477c9350148a2df8345a88ee46b09e1eae0016",
          "normalizer": "mister-clean/public-safety-root@1",
          "cause_key": {
            "detector_family": "public_safety",
            "rule": "custom-denylist-1",
            "path": "source.txt",
            "line": 1
          },
          "observation_ids": [
            "99601ca5d423bedfe150c054706070ad67e21eec0927fac86792c81edf98b084"
          ],
          "origin": {
            "class": "baseline"
          }
        },
        {
          "id": "DEBT-PUBLIC-SAFETY-UNASSESSED-DD39100D20641895",
          "class": "public_safety_unassessed_unsupported_tracked_entry",
          "observation_count": 1,
          "detector_finding_fingerprints": [
            "dd39100d20641895208fb5b544d8dea5afcadd86bd9bc3071355f273a4234135"
          ],
          "affected_paths": [
            "vendor/module"
          ],
          "repair_boundary": "file:vendor/module",
          "procedure": "Make vendor/module safely text-assessable or explicitly remove it from the tracked shippable surface, then rerun public-safety inspection",
          "state": "open",
          "disposition": "autonomously_repair",
          "evidence": [
            {
              "kind": "public_safety_scan",
              "object": "325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489",
              "command": "mister-clean audit public-safety . --tracked --denylist-file public-safety-denylist.txt --json",
              "result": "unassessed unsupported_tracked_entry fingerprint dd39100d20641895208fb5b544d8dea5afcadd86bd9bc3071355f273a4234135",
              "observed_at": "2026-11-17T00:00:00.000Z",
              "evidence_ref": {
                "path": "public-safety-audit.json",
                "sha256": "21713e534ac9c9c4875e922d619ef6a11d6bb6eb529a1992317309b540bb24d5"
              }
            }
          ],
          "debt_key": "bdb26bae764cf742e1351a31daa6a58ef4e6232795fc4a05cab0041930e5d50d",
          "normalizer": "mister-clean/public-safety-root@1",
          "cause_key": {
            "detector_family": "public_safety",
            "reason": "unsupported_tracked_entry",
            "path": "vendor/module"
          },
          "observation_ids": [
            "ffb470a0934843e271558a487862ae1787a59589e99271124267e09c7af46ecc"
          ],
          "origin": {
            "class": "baseline"
          }
        },
        {
          "id": "DEBT-GITHUB-ACTIONS-C54FFF889425F608",
          "class": "github_actions_workflow_run_upstream_identity_unbound",
          "severity": "P0",
          "observation_count": 1,
          "detector_finding_fingerprints": [
            "0df23b92e82a76d39043a7db0c54f9f86db77987cbfd118a44673759a9d055b9"
          ],
          "affected_paths": [
            ".github/workflows/cd.yml"
          ],
          "affected_refs": [
            ".github/workflows/cd.yml#line-3"
          ],
          "repair_boundary": "path:.github/workflows/cd.yml",
          "procedure": "Repair workflow run upstream identity unbound as one fail-closed workflow invariant, add a negative control, then rerun the GitHub Actions audit",
          "state": "open",
          "disposition": "autonomously_repair",
          "evidence": [
            {
              "kind": "gate_result",
              "object": "325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489",
              "command": "mister-clean audit github-actions . --json",
              "result": "1 observation(s): A privileged workflow_run can accept a historical rerun without binding it either to the current trusted main tip or to retained, allowlisted upstream workflow identity and bytes.",
              "observed_at": "2026-11-17T00:00:00.000Z",
              "evidence_ref": {
                "path": "github-actions-audit.json",
                "sha256": "c043de83d1819fe4f5b8aaad5370aac88ce1696b06c7a459e6f4cc19758fbf2b"
              }
            }
          ],
          "debt_key": "bc716d375fc7b5656186abe1473d49be26d2975cb3ad9e89fbe43b326bab1da4",
          "normalizer": "mister-clean/github-actions-root@1",
          "cause_key": {
            "detector_family": "github_actions",
            "path": ".github/workflows/cd.yml",
            "rule": "workflow_run_upstream_identity_unbound"
          },
          "observation_ids": [
            "637f1c5079f13d33d69ba47c077a276f8bb06a62d50443e24114b2d94eac069d"
          ],
          "origin": {
            "class": "baseline"
          }
        },
        {
          "id": "DEBT-GITHUB-ACTIONS-CA8828E501853B45",
          "class": "github_actions_health_gate_identity_unbound",
          "severity": "P1",
          "observation_count": 2,
          "detector_finding_fingerprints": [
            "2ea8b93c88318e349ab803dc57605280282c5705c2e3efdbf7734895457af199",
            "e88c3abb48880b83c937699467abfd9b89d7bb4d49d5c5648c25e8665769dfea"
          ],
          "affected_paths": [
            ".github/workflows/cd.yml"
          ],
          "affected_refs": [
            ".github/workflows/cd.yml#line-16",
            ".github/workflows/cd.yml#line-14"
          ],
          "repair_boundary": "path:.github/workflows/cd.yml",
          "procedure": "Repair health gate identity unbound as one fail-closed workflow invariant, add a negative control, then rerun the GitHub Actions audit",
          "state": "open",
          "disposition": "autonomously_repair",
          "evidence": [
            {
              "kind": "gate_result",
              "object": "325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489",
              "command": "mister-clean audit github-actions . --json",
              "result": "2 observation(s): Health-verification step Verify health again accepts status without proving the expected named check is present exactly as required.",
              "observed_at": "2026-11-17T00:00:00.000Z",
              "evidence_ref": {
                "path": "github-actions-audit.json",
                "sha256": "c043de83d1819fe4f5b8aaad5370aac88ce1696b06c7a459e6f4cc19758fbf2b"
              }
            }
          ],
          "debt_key": "c2094085bf1a2f5d7bc166f97425cb2acd83a4b41b298720c1e800ad547c9dd8",
          "normalizer": "mister-clean/github-actions-root@1",
          "cause_key": {
            "detector_family": "github_actions",
            "path": ".github/workflows/cd.yml",
            "rule": "health_gate_identity_unbound"
          },
          "observation_ids": [
            "4f170331aac7b3d4917f86900207c1d0e988c7c4b72ae2e6d239532111abfe27",
            "94f51158a0e9f4f48869a5474bbfea88e315313d0c6fe0e42540e585d1efb978"
          ],
          "origin": {
            "class": "baseline"
          }
        },
        {
          "id": "DEBT-GITHUB-ACTIONS-0D773C318052D79F",
          "class": "github_actions_privileged_action_mutable",
          "severity": "P1",
          "observation_count": 1,
          "detector_finding_fingerprints": [
            "48c917dd897e77b08d346bfe078af8d917a0e121c5df5f74dde5d1feac66cf83"
          ],
          "affected_paths": [
            ".github/workflows/cd.yml"
          ],
          "affected_refs": [
            ".github/workflows/cd.yml#line-11",
            ".github/workflows/cd.yml#line-12"
          ],
          "repair_boundary": "path:.github/workflows/cd.yml",
          "procedure": "Repair privileged action mutable as one fail-closed workflow invariant, add a negative control, then rerun the GitHub Actions audit",
          "state": "open",
          "disposition": "autonomously_repair",
          "evidence": [
            {
              "kind": "gate_result",
              "object": "325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489",
              "command": "mister-clean audit github-actions . --json",
              "result": "1 observation(s): Effectful job deploy executes one or more actions that are not pinned to immutable commits.",
              "observed_at": "2026-11-17T00:00:00.000Z",
              "evidence_ref": {
                "path": "github-actions-audit.json",
                "sha256": "c043de83d1819fe4f5b8aaad5370aac88ce1696b06c7a459e6f4cc19758fbf2b"
              }
            }
          ],
          "debt_key": "d5d633effde326b8aa102490a840c6817aebe6013ed9fa5d76de74940d94bf1f",
          "normalizer": "mister-clean/github-actions-root@1",
          "cause_key": {
            "detector_family": "github_actions",
            "path": ".github/workflows/cd.yml",
            "rule": "privileged_action_mutable"
          },
          "observation_ids": [
            "722f1629ed2e3365d32fc309023efbb8b4320068702359584d2155ae3d6700eb"
          ],
          "origin": {
            "class": "baseline"
          }
        },
        {
          "id": "DEBT-GITHUB-ACTIONS-0417448737586493",
          "class": "github_actions_permissions_implicit",
          "severity": "P1",
          "observation_count": 1,
          "detector_finding_fingerprints": [
            "6a1d5714eeaaeab542d514b298fdd3e16ac86a247d14dc29fcff076b0a2741a8"
          ],
          "affected_paths": [
            ".github/workflows/cd.yml"
          ],
          "affected_refs": [
            ".github/workflows/cd.yml#line-8"
          ],
          "repair_boundary": "path:.github/workflows/cd.yml",
          "procedure": "Repair permissions implicit as one fail-closed workflow invariant, add a negative control, then rerun the GitHub Actions audit",
          "state": "open",
          "disposition": "autonomously_repair",
          "evidence": [
            {
              "kind": "gate_result",
              "object": "325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489",
              "command": "mister-clean audit github-actions . --json",
              "result": "1 observation(s): Effectful job deploy relies on implicit GitHub token permissions.",
              "observed_at": "2026-11-17T00:00:00.000Z",
              "evidence_ref": {
                "path": "github-actions-audit.json",
                "sha256": "c043de83d1819fe4f5b8aaad5370aac88ce1696b06c7a459e6f4cc19758fbf2b"
              }
            }
          ],
          "debt_key": "b69a3a1e2a74f767a0e867d9229b70f75e61c610742bbc38c5f24ac0d50b59f0",
          "normalizer": "mister-clean/github-actions-root@1",
          "cause_key": {
            "detector_family": "github_actions",
            "path": ".github/workflows/cd.yml",
            "rule": "permissions_implicit"
          },
          "observation_ids": [
            "6ca11e036825687def362a4cbc5c0005332b25b61127aaa168b1e606bebc9948"
          ],
          "origin": {
            "class": "baseline"
          }
        },
        {
          "id": "DEBT-GITHUB-ACTIONS-7DA04E675CCCFDB0",
          "class": "github_actions_workflow_run_source_untrusted",
          "severity": "P0",
          "observation_count": 1,
          "detector_finding_fingerprints": [
            "6c0ba00bc77e89d6c4029f9d96373a9129bbae0f8fbba67f151fb2e33877364d"
          ],
          "affected_paths": [
            ".github/workflows/cd.yml"
          ],
          "affected_refs": [
            ".github/workflows/cd.yml#line-3"
          ],
          "repair_boundary": "path:.github/workflows/cd.yml",
          "procedure": "Repair workflow run source untrusted as one fail-closed workflow invariant, add a negative control, then rerun the GitHub Actions audit",
          "state": "open",
          "disposition": "autonomously_repair",
          "evidence": [
            {
              "kind": "gate_result",
              "object": "325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489",
              "command": "mister-clean audit github-actions . --json",
              "result": "1 observation(s): A privileged workflow_run source is not jointly bound to the same repository, a trusted push event, and ancestry in a freshly fetched trusted main ref before candidate code executes.",
              "observed_at": "2026-11-17T00:00:00.000Z",
              "evidence_ref": {
                "path": "github-actions-audit.json",
                "sha256": "c043de83d1819fe4f5b8aaad5370aac88ce1696b06c7a459e6f4cc19758fbf2b"
              }
            }
          ],
          "debt_key": "2f702660734a931a552213e53d726ded6ddde9f2ee62a7f13c22a2fc554b4e16",
          "normalizer": "mister-clean/github-actions-root@1",
          "cause_key": {
            "detector_family": "github_actions",
            "path": ".github/workflows/cd.yml",
            "rule": "workflow_run_source_untrusted"
          },
          "observation_ids": [
            "f595b30e54c8ef097f5967bbbc8235c50e4fc1fb0f22bbbcb726baedc13cc64c"
          ],
          "origin": {
            "class": "baseline"
          }
        },
        {
          "id": "DEBT-GITHUB-ACTIONS-0CF233B1C18AEE1B",
          "class": "github_actions_health_gate_nonblocking",
          "severity": "P1",
          "observation_count": 2,
          "detector_finding_fingerprints": [
            "7ec42733f460f66eb2994a029c0ed80a4aa2761d0e60061f4d9b2dcf0bfce62b",
            "df72a21beaef99a48d3ab31bcf668708e1d3e93f60596fb9e848425bf8cafb2f"
          ],
          "affected_paths": [
            ".github/workflows/cd.yml"
          ],
          "affected_refs": [
            ".github/workflows/cd.yml#line-16",
            ".github/workflows/cd.yml#line-14"
          ],
          "repair_boundary": "path:.github/workflows/cd.yml",
          "procedure": "Repair health gate nonblocking as one fail-closed workflow invariant, add a negative control, then rerun the GitHub Actions audit",
          "state": "open",
          "disposition": "autonomously_repair",
          "evidence": [
            {
              "kind": "gate_result",
              "object": "325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489",
              "command": "mister-clean audit github-actions . --json",
              "result": "2 observation(s): Health-verification step Verify health again does not prove a nonpassing dependency stops promotion.",
              "observed_at": "2026-11-17T00:00:00.000Z",
              "evidence_ref": {
                "path": "github-actions-audit.json",
                "sha256": "c043de83d1819fe4f5b8aaad5370aac88ce1696b06c7a459e6f4cc19758fbf2b"
              }
            }
          ],
          "debt_key": "5f5d467cf1135d7dd8d069f2e03d710a93874ed90673b4c93d52c2cf36d54e37",
          "normalizer": "mister-clean/github-actions-root@1",
          "cause_key": {
            "detector_family": "github_actions",
            "path": ".github/workflows/cd.yml",
            "rule": "health_gate_nonblocking"
          },
          "observation_ids": [
            "61892902a1101ea7349047d93006503895c43dc112d8a50ae7f5599cf474f588",
            "b871403ea8ed7df91514385394ea3dfb3142c5bb030237e627debc19b271a9d2"
          ],
          "origin": {
            "class": "baseline"
          }
        },
        {
          "id": "DEBT-GITHUB-ACTIONS-48FEABCB30D8E098",
          "class": "github_actions_manual_sensitive_ref_unbound",
          "severity": "P0",
          "observation_count": 1,
          "detector_finding_fingerprints": [
            "c0ac098d3965b3e9192663b1e4bf71998be5a766d3ef0c1e01aa99c4fbaa8d5e"
          ],
          "affected_paths": [
            ".github/workflows/cd.yml"
          ],
          "affected_refs": [
            ".github/workflows/cd.yml#line-6"
          ],
          "repair_boundary": "path:.github/workflows/cd.yml",
          "procedure": "Repair manual sensitive ref unbound as one fail-closed workflow invariant, add a negative control, then rerun the GitHub Actions audit",
          "state": "open",
          "disposition": "autonomously_repair",
          "evidence": [
            {
              "kind": "gate_result",
              "object": "325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489",
              "command": "mister-clean audit github-actions . --json",
              "result": "1 observation(s): A manually dispatched effectful workflow is not fail-closed to refs/heads/main.",
              "observed_at": "2026-11-17T00:00:00.000Z",
              "evidence_ref": {
                "path": "github-actions-audit.json",
                "sha256": "c043de83d1819fe4f5b8aaad5370aac88ce1696b06c7a459e6f4cc19758fbf2b"
              }
            }
          ],
          "debt_key": "deb2baf073348880449e2b2b45318cf067b9463b8b51c3a3af3e08c8ae5c7a21",
          "normalizer": "mister-clean/github-actions-root@1",
          "cause_key": {
            "detector_family": "github_actions",
            "path": ".github/workflows/cd.yml",
            "rule": "manual_sensitive_ref_unbound"
          },
          "observation_ids": [
            "41d53e2a012d5e0e77ef88f4042bb0d3d0c4a808ae952a44693befe876f89906"
          ],
          "origin": {
            "class": "baseline"
          }
        },
        {
          "id": "DEBT-GITHUB-ACTIONS-E1ED089C15283C81",
          "class": "github_actions_workflow_run_checkout_unbound",
          "severity": "P1",
          "observation_count": 1,
          "detector_finding_fingerprints": [
            "c138b13948bc202503066f3a7b0398451a9b1cfd6bc564c550979a18a17355d4"
          ],
          "affected_paths": [
            ".github/workflows/cd.yml"
          ],
          "affected_refs": [
            ".github/workflows/cd.yml#line-11"
          ],
          "repair_boundary": "path:.github/workflows/cd.yml",
          "procedure": "Repair workflow run checkout unbound as one fail-closed workflow invariant, add a negative control, then rerun the GitHub Actions audit",
          "state": "open",
          "disposition": "autonomously_repair",
          "evidence": [
            {
              "kind": "gate_result",
              "object": "325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489",
              "command": "mister-clean audit github-actions . --json",
              "result": "1 observation(s): An effectful workflow_run checkout is not explicitly bound to the CI-passed head SHA.",
              "observed_at": "2026-11-17T00:00:00.000Z",
              "evidence_ref": {
                "path": "github-actions-audit.json",
                "sha256": "c043de83d1819fe4f5b8aaad5370aac88ce1696b06c7a459e6f4cc19758fbf2b"
              }
            }
          ],
          "debt_key": "bf49b9494aca63e6800d01f01f287b5185342dab4161d2ce131b0f71716667cb",
          "normalizer": "mister-clean/github-actions-root@1",
          "cause_key": {
            "detector_family": "github_actions",
            "path": ".github/workflows/cd.yml",
            "rule": "workflow_run_checkout_unbound"
          },
          "observation_ids": [
            "23f66e546d02049a4f87430bc92aee013d3b3582db9e619367040e7079f0aae8"
          ],
          "origin": {
            "class": "baseline"
          }
        },
        {
          "id": "DEBT-LANGUAGE-POLICY-6158DE9572BC94C1",
          "class": "language_policy_forbidden_language",
          "observation_count": 1,
          "detector_finding_fingerprints": [
            "6158de9572bc94c15f65ba3e2d24133136fdb73c7472e0defb900d057c5a6012"
          ],
          "affected_paths": [
            "tools/legacy.rb"
          ],
          "repair_boundary": "file:tools/legacy.rb",
          "procedure": "Port tools/legacy.rb out of the forbidden .rb language declared in .mister-clean/language-policy.json (or have the owner allow it), then rerun the language-policy audit",
          "state": "open",
          "disposition": "autonomously_repair",
          "evidence": [
            {
              "kind": "gate_result",
              "object": "325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489",
              "command": "mister-clean audit language-policy . --json",
              "result": "forbidden_language .rb: tools/legacy.rb",
              "observed_at": "2026-11-17T00:00:00.000Z",
              "evidence_ref": {
                "path": "language-policy-audit.json",
                "sha256": "20f6f45488f00116a1cab2906db8960f84a0dec2186855f6ee9888966127f016"
              }
            }
          ],
          "debt_key": "2b8df554e3e06c3da57eb1bc2d192fbdaa21446412019286aed8c45f521d87d1",
          "normalizer": "mister-clean/language-policy-root@1",
          "cause_key": {
            "detector_family": "language_policy",
            "path": "tools/legacy.rb",
            "extension": ".rb"
          },
          "observation_ids": [
            "8ea2a255183e5ce55d4d4ecb3738ef0cd72677c328d900491305d1df79d35be7"
          ],
          "origin": {
            "class": "baseline"
          }
        },
        {
          "id": "DEBT-SEMANTIC-SET-C1E133ED21F464EB",
          "class": "semantic_probe_set_unassigned",
          "observation_count": 2,
          "detector_finding_fingerprints": [
            "a0ead31c77a8096da420934892a39ac06a8b1170cc7e36a36a2d4e4fa8781d35",
            "b3bb2a1539f1126fcdb7c378f264c9caa48fbf4858901480403d656241cc953a"
          ],
          "affected_paths": [
            "planning/SECURITY.md"
          ],
          "repair_boundary": "probe-set:c1e133ed21f464ebd407f9d35e03d757e11b9283e074a1f67b1fc3f26f0c7f24",
          "procedure": "Triage the 2 semantic candidates once, bind one complete manifest to candidate set c1e133ed21f464ebd407f9d35e03d757e11b9283e074a1f67b1fc3f26f0c7f24, then execute or explicitly dispose each candidate",
          "state": "open",
          "disposition": "autonomously_validate",
          "evidence": [
            {
              "kind": "gate_result",
              "object": "325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489",
              "command": "mister-clean audit semantic . --json",
              "result": "2 unassigned candidates share one missing-manifest root cause",
              "observed_at": "2026-11-17T00:00:00.000Z",
              "evidence_ref": {
                "path": "semantic-audit.json",
                "sha256": "859ebd0c7e5e7145b6515c06ecef0c20fe3bd51a3d92c95e4132219e457c09ce"
              }
            }
          ],
          "debt_key": "2f7cbbbbd03d020866f6c856b02f89bdc93f425c6179a0dfcd49adadb1beae74",
          "normalizer": "mister-clean/semantic-candidate-set@1",
          "cause_key": {
            "detector_family": "semantic_boundary",
            "candidate_set_sha256": "c1e133ed21f464ebd407f9d35e03d757e11b9283e074a1f67b1fc3f26f0c7f24",
            "code": "semantic_probe_unassigned"
          },
          "observation_ids": [
            "3267a65205c5138ecb70bca5ab188bec34f4d9ca172c37858662d9f5b7acbe53",
            "5ef4ad1b2272df2a250436af29d7b577f72fa82c7e56beb3acdf5feb87a8dd09"
          ],
          "origin": {
            "class": "baseline"
          }
        },
        {
          "id": "DEBT-NATIVE-GATE-BEC26C70EB3498D0",
          "class": "native_gate_absent",
          "observation_count": 1,
          "affected_paths": [
            "package.json"
          ],
          "repair_boundary": "gate:node:.:native-quality",
          "procedure": "Restore a safe repository-native repository_tests gate for node:.:native-quality, then rerun closeout",
          "state": "open",
          "disposition": "autonomously_repair",
          "evidence": [
            {
              "kind": "gate_result",
              "object": "325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489",
              "command": "mister-clean native gate discovery",
              "result": "required native gate is absent (manager_unresolved)",
              "observed_at": "2026-11-17T00:00:00.000Z",
              "evidence_ref": {
                "path": "native-gate-validation.json",
                "sha256": "<NATIVE_GATE_VALIDATION_SHA256>"
              }
            }
          ],
          "debt_key": "cb7adff7d24a860dc7dec7f053bbbd29d48125d8a4bf40a23fda045baaf69552",
          "normalizer": "mister-clean/native-gate-root@4",
          "cause_key": {
            "gate_id": "node:.:native-quality",
            "semantic_contract_sha256": "e4b3431ff0099aa6494ed0068b37501db6a7ee9dc157a8165fd965cd9e9d051a"
          },
          "observation_ids": [
            "b716861b6768013bd0d65ec622ca4247b4180c3024d6022a3bccadb4ff925394"
          ],
          "origin": {
            "class": "baseline"
          }
        },
        {
          "id": "DEBT-RETIREMENT-RATIFICATION-D998D7781C9E0249",
          "class": "retirement_ratification",
          "observation_count": 1,
          "affected_paths": [
            "legacy"
          ],
          "affected_refs": [
            "charter/retirements/2026-11-17-legacy.json",
            "charter/owner-decisions/2026-11-17-retire-legacy.md"
          ],
          "repair_boundary": "decision:charter/retirements/2026-11-17-legacy.json",
          "procedure": "retirement ratification: not verifiable (O-RET-2) — owner decision required. 1 debt(s) under legacy are held as accepted_exception on the strength of charter/retirements/2026-11-17-legacy.json, which names \"operator\" but which any committer can write. An owner must ratify the retirement, or it must be withdrawn, before the run can be CLEAN.",
          "state": "open",
          "disposition": "decision_or_coordination_required",
          "evidence": [],
          "debt_key": "9c9799447c09d7184023308780c7765ea801703254b7af86f1a467fab1c359d1",
          "normalizer": "mister-clean/retirement-ratification@1",
          "cause_key": {
            "record_path": "charter/retirements/2026-11-17-legacy.json",
            "record_sha256": "1f148dc5ea607fc73633e42e3d5b6d7557c9d4e3a88a961c042d25eb2768193e"
          },
          "observation_ids": [
            "2898172c04d006d5e900aa38626c17ebea0d2850b714941e7470bd60c96f6b12"
          ],
          "origin": {
            "class": "baseline"
          }
        }
      ],
      "retirement_applications": [
        {
          "record_path": "charter/retirements/2026-11-17-legacy.json",
          "slug": "legacy-corpus",
          "root": "legacy",
          "debt_ids": [
            "DEBT-PUBLIC-SAFETY-B316B0C2730FE055"
          ],
          "record_sha256": "1f148dc5ea607fc73633e42e3d5b6d7557c9d4e3a88a961c042d25eb2768193e"
        }
      ],
      "debt_census": {
        "discovered": 16,
        "paid": 0,
        "accepted_exception": 1
      },
      "public_safety_debt_accounting": {
        "debt_count": 3,
        "exempted_finding_count": 2
      },
      "planning_accounting": {
        "raw_finding_count": 1,
        "root_debt_count": 1,
        "suppressed_by_typed_nonartifact_count": 0,
        "candidate_probe_count": 0,
        "evidence_ref": {
          "path": "planning-audit.json",
          "sha256": "c75c11976429616ba7445dd07bc9c42a6c38c62a101cf7793c5ff5bd79b2403b"
        }
      },
      "public_safety_accounting": {
        "tracked_path_count": 15,
        "finding_count": 4,
        "unassessed_count": 1,
        "exempted_count": 2,
        "evidence_ref": {
          "path": "public-safety-audit.json",
          "sha256": "21713e534ac9c9c4875e922d619ef6a11d6bb6eb529a1992317309b540bb24d5"
        }
      },
      "github_actions_accounting": {
        "workflow_count": 1,
        "sensitive_workflow_count": 1,
        "finding_count": 10,
        "root_debt_count": 8,
        "evidence_ref": {
          "path": "github-actions-audit.json",
          "sha256": "c043de83d1819fe4f5b8aaad5370aac88ce1696b06c7a459e6f4cc19758fbf2b"
        }
      },
      "language_policy_accounting": {
        "status": "fail",
        "tracked_path_count": 15,
        "finding_count": 1,
        "generated_exempt_count": 0,
        "allowed_count": 0,
        "root_debt_count": 1,
        "evidence_ref": {
          "path": "language-policy-audit.json",
          "sha256": "20f6f45488f00116a1cab2906db8960f84a0dec2186855f6ee9888966127f016"
        }
      },
      "semantic_accounting": {
        "candidate_probe_count": 2,
        "executed_probe_count": 0,
        "resolved_probe_count": 0,
        "confirmed_failure_count": 0,
        "pending_probe_count": 0,
        "finding_count": 2,
        "evidence_ref": {
          "path": "semantic-audit.json",
          "sha256": "859ebd0c7e5e7145b6515c06ecef0c20fe3bd51a3d92c95e4132219e457c09ce"
        }
      }
    },
    "regression_delta_lines": [
      "{",
      "  \"record_type\": \"mister-clean.regression-delta\",",
      "  \"schema_version\": \"1.6\",",
      "  \"policy\": \"zero_open_run_introduced_debt\",",
      "  \"baseline_object\": \"325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489\",",
      "  \"baseline_repository_object\": {",
      "    \"record_type\": \"mister-clean.repository-object\",",
      "    \"schema_version\": \"1.0\",",
      "    \"head_commit\": \"69bcd8fb1f814918a9c869ff26df1e55504f0b83\",",
      "    \"surface\": \"tracked_and_nonignored\",",
      "    \"entry_count\": 15,",
      "    \"sha256\": \"325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489\"",
      "  },",
      "  \"closing_object\": \"325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489\",",
      "  \"closing_repository_object\": {",
      "    \"record_type\": \"mister-clean.repository-object\",",
      "    \"schema_version\": \"1.0\",",
      "    \"head_commit\": \"69bcd8fb1f814918a9c869ff26df1e55504f0b83\",",
      "    \"surface\": \"tracked_and_nonignored\",",
      "    \"entry_count\": 15,",
      "    \"sha256\": \"325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489\"",
      "  },",
      "  \"accounting\": {",
      "    \"schema_version\": \"1.5\",",
      "    \"observation_ledger\": {",
      "      \"identity_scheme\": \"mister-clean.observation.v1\",",
      "      \"ledger_sha256\": \"bb92ff0cfb2eb2203f2981cd1e9a63d16b1e0c836e2ad16a7748954ff2c39b5f\",",
      "      \"baseline_observation_ids\": [",
      "        \"23f66e546d02049a4f87430bc92aee013d3b3582db9e619367040e7079f0aae8\",",
      "        \"2898172c04d006d5e900aa38626c17ebea0d2850b714941e7470bd60c96f6b12\",",
      "        \"28c1efefe0d3530448e70c89c226a9562dd7196986555fa831c1463cf1d8da72\",",
      "        \"3267a65205c5138ecb70bca5ab188bec34f4d9ca172c37858662d9f5b7acbe53\",",
      "        \"41d53e2a012d5e0e77ef88f4042bb0d3d0c4a808ae952a44693befe876f89906\",",
      "        \"4b6971c632ba74b2758b06454be283684f55fd118fbcf7f3c53313d1453fa4f4\",",
      "        \"4f170331aac7b3d4917f86900207c1d0e988c7c4b72ae2e6d239532111abfe27\",",
      "        \"5ef4ad1b2272df2a250436af29d7b577f72fa82c7e56beb3acdf5feb87a8dd09\",",
      "        \"61892902a1101ea7349047d93006503895c43dc112d8a50ae7f5599cf474f588\",",
      "        \"637f1c5079f13d33d69ba47c077a276f8bb06a62d50443e24114b2d94eac069d\",",
      "        \"6ca11e036825687def362a4cbc5c0005332b25b61127aaa168b1e606bebc9948\",",
      "        \"722f1629ed2e3365d32fc309023efbb8b4320068702359584d2155ae3d6700eb\",",
      "        \"8ea2a255183e5ce55d4d4ecb3738ef0cd72677c328d900491305d1df79d35be7\",",
      "        \"94f51158a0e9f4f48869a5474bbfea88e315313d0c6fe0e42540e585d1efb978\",",
      "        \"99601ca5d423bedfe150c054706070ad67e21eec0927fac86792c81edf98b084\",",
      "        \"b716861b6768013bd0d65ec622ca4247b4180c3024d6022a3bccadb4ff925394\",",
      "        \"b871403ea8ed7df91514385394ea3dfb3142c5bb030237e627debc19b271a9d2\",",
      "        \"f595b30e54c8ef097f5967bbbc8235c50e4fc1fb0f22bbbcb726baedc13cc64c\",",
      "        \"ffb470a0934843e271558a487862ae1787a59589e99271124267e09c7af46ecc\"",
      "      ],",
      "      \"closing_observation_ids\": [",
      "        \"23f66e546d02049a4f87430bc92aee013d3b3582db9e619367040e7079f0aae8\",",
      "        \"2898172c04d006d5e900aa38626c17ebea0d2850b714941e7470bd60c96f6b12\",",
      "        \"28c1efefe0d3530448e70c89c226a9562dd7196986555fa831c1463cf1d8da72\",",
      "        \"3267a65205c5138ecb70bca5ab188bec34f4d9ca172c37858662d9f5b7acbe53\",",
      "        \"41d53e2a012d5e0e77ef88f4042bb0d3d0c4a808ae952a44693befe876f89906\",",
      "        \"4b6971c632ba74b2758b06454be283684f55fd118fbcf7f3c53313d1453fa4f4\",",
      "        \"4f170331aac7b3d4917f86900207c1d0e988c7c4b72ae2e6d239532111abfe27\",",
      "        \"5ef4ad1b2272df2a250436af29d7b577f72fa82c7e56beb3acdf5feb87a8dd09\",",
      "        \"61892902a1101ea7349047d93006503895c43dc112d8a50ae7f5599cf474f588\",",
      "        \"637f1c5079f13d33d69ba47c077a276f8bb06a62d50443e24114b2d94eac069d\",",
      "        \"6ca11e036825687def362a4cbc5c0005332b25b61127aaa168b1e606bebc9948\",",
      "        \"722f1629ed2e3365d32fc309023efbb8b4320068702359584d2155ae3d6700eb\",",
      "        \"8ea2a255183e5ce55d4d4ecb3738ef0cd72677c328d900491305d1df79d35be7\",",
      "        \"94f51158a0e9f4f48869a5474bbfea88e315313d0c6fe0e42540e585d1efb978\",",
      "        \"99601ca5d423bedfe150c054706070ad67e21eec0927fac86792c81edf98b084\",",
      "        \"b716861b6768013bd0d65ec622ca4247b4180c3024d6022a3bccadb4ff925394\",",
      "        \"b871403ea8ed7df91514385394ea3dfb3142c5bb030237e627debc19b271a9d2\",",
      "        \"f595b30e54c8ef097f5967bbbc8235c50e4fc1fb0f22bbbcb726baedc13cc64c\",",
      "        \"ffb470a0934843e271558a487862ae1787a59589e99271124267e09c7af46ecc\"",
      "      ],",
      "      \"observed_observation_ids\": [",
      "        \"23f66e546d02049a4f87430bc92aee013d3b3582db9e619367040e7079f0aae8\",",
      "        \"2898172c04d006d5e900aa38626c17ebea0d2850b714941e7470bd60c96f6b12\",",
      "        \"28c1efefe0d3530448e70c89c226a9562dd7196986555fa831c1463cf1d8da72\",",
      "        \"3267a65205c5138ecb70bca5ab188bec34f4d9ca172c37858662d9f5b7acbe53\",",
      "        \"41d53e2a012d5e0e77ef88f4042bb0d3d0c4a808ae952a44693befe876f89906\",",
      "        \"4b6971c632ba74b2758b06454be283684f55fd118fbcf7f3c53313d1453fa4f4\",",
      "        \"4f170331aac7b3d4917f86900207c1d0e988c7c4b72ae2e6d239532111abfe27\",",
      "        \"5ef4ad1b2272df2a250436af29d7b577f72fa82c7e56beb3acdf5feb87a8dd09\",",
      "        \"61892902a1101ea7349047d93006503895c43dc112d8a50ae7f5599cf474f588\",",
      "        \"637f1c5079f13d33d69ba47c077a276f8bb06a62d50443e24114b2d94eac069d\",",
      "        \"6ca11e036825687def362a4cbc5c0005332b25b61127aaa168b1e606bebc9948\",",
      "        \"722f1629ed2e3365d32fc309023efbb8b4320068702359584d2155ae3d6700eb\",",
      "        \"8ea2a255183e5ce55d4d4ecb3738ef0cd72677c328d900491305d1df79d35be7\",",
      "        \"94f51158a0e9f4f48869a5474bbfea88e315313d0c6fe0e42540e585d1efb978\",",
      "        \"99601ca5d423bedfe150c054706070ad67e21eec0927fac86792c81edf98b084\",",
      "        \"b716861b6768013bd0d65ec622ca4247b4180c3024d6022a3bccadb4ff925394\",",
      "        \"b871403ea8ed7df91514385394ea3dfb3142c5bb030237e627debc19b271a9d2\",",
      "        \"f595b30e54c8ef097f5967bbbc8235c50e4fc1fb0f22bbbcb726baedc13cc64c\",",
      "        \"ffb470a0934843e271558a487862ae1787a59589e99271124267e09c7af46ecc\"",
      "      ]",
      "    },",
      "    \"root_debt_ledger\": {",
      "      \"identity_scheme\": \"mister-clean.root-debt.v1\",",
      "      \"ledger_sha256\": \"d4f7c33e18fea92221d908e8c07f42e7dbdd06da30564192cb39e1b2bb7f7c96\",",
      "      \"baseline_present_debt_keys\": [",
      "        \"2b8df554e3e06c3da57eb1bc2d192fbdaa21446412019286aed8c45f521d87d1\",",
      "        \"2f702660734a931a552213e53d726ded6ddde9f2ee62a7f13c22a2fc554b4e16\",",
      "        \"2f7cbbbbd03d020866f6c856b02f89bdc93f425c6179a0dfcd49adadb1beae74\",",
      "        \"5c215d4ccabcbff2433a0baf2ccda41ab81e6bbd5ff3d0b010433979686ed292\",",
      "        \"5f5d467cf1135d7dd8d069f2e03d710a93874ed90673b4c93d52c2cf36d54e37\",",
      "        \"73640a11edff1b74f9cc5a6c5b24bd8b0e222da8f66a43ddf890f4f9efa43299\",",
      "        \"9c9799447c09d7184023308780c7765ea801703254b7af86f1a467fab1c359d1\",",
      "        \"b69a3a1e2a74f767a0e867d9229b70f75e61c610742bbc38c5f24ac0d50b59f0\",",
      "        \"bc716d375fc7b5656186abe1473d49be26d2975cb3ad9e89fbe43b326bab1da4\",",
      "        \"bdb26bae764cf742e1351a31daa6a58ef4e6232795fc4a05cab0041930e5d50d\",",
      "        \"bf49b9494aca63e6800d01f01f287b5185342dab4161d2ce131b0f71716667cb\",",
      "        \"c2094085bf1a2f5d7bc166f97425cb2acd83a4b41b298720c1e800ad547c9dd8\",",
      "        \"cb7adff7d24a860dc7dec7f053bbbd29d48125d8a4bf40a23fda045baaf69552\",",
      "        \"d5d633effde326b8aa102490a840c6817aebe6013ed9fa5d76de74940d94bf1f\",",
      "        \"deb2baf073348880449e2b2b45318cf067b9463b8b51c3a3af3e08c8ae5c7a21\",",
      "        \"fb9abbe9e9a1f404a2f96d17fc477c9350148a2df8345a88ee46b09e1eae0016\"",
      "      ],",
      "      \"closing_present_debt_keys\": [",
      "        \"2b8df554e3e06c3da57eb1bc2d192fbdaa21446412019286aed8c45f521d87d1\",",
      "        \"2f702660734a931a552213e53d726ded6ddde9f2ee62a7f13c22a2fc554b4e16\",",
      "        \"2f7cbbbbd03d020866f6c856b02f89bdc93f425c6179a0dfcd49adadb1beae74\",",
      "        \"5c215d4ccabcbff2433a0baf2ccda41ab81e6bbd5ff3d0b010433979686ed292\",",
      "        \"5f5d467cf1135d7dd8d069f2e03d710a93874ed90673b4c93d52c2cf36d54e37\",",
      "        \"73640a11edff1b74f9cc5a6c5b24bd8b0e222da8f66a43ddf890f4f9efa43299\",",
      "        \"9c9799447c09d7184023308780c7765ea801703254b7af86f1a467fab1c359d1\",",
      "        \"b69a3a1e2a74f767a0e867d9229b70f75e61c610742bbc38c5f24ac0d50b59f0\",",
      "        \"bc716d375fc7b5656186abe1473d49be26d2975cb3ad9e89fbe43b326bab1da4\",",
      "        \"bdb26bae764cf742e1351a31daa6a58ef4e6232795fc4a05cab0041930e5d50d\",",
      "        \"bf49b9494aca63e6800d01f01f287b5185342dab4161d2ce131b0f71716667cb\",",
      "        \"c2094085bf1a2f5d7bc166f97425cb2acd83a4b41b298720c1e800ad547c9dd8\",",
      "        \"cb7adff7d24a860dc7dec7f053bbbd29d48125d8a4bf40a23fda045baaf69552\",",
      "        \"d5d633effde326b8aa102490a840c6817aebe6013ed9fa5d76de74940d94bf1f\",",
      "        \"deb2baf073348880449e2b2b45318cf067b9463b8b51c3a3af3e08c8ae5c7a21\",",
      "        \"fb9abbe9e9a1f404a2f96d17fc477c9350148a2df8345a88ee46b09e1eae0016\"",
      "      ]",
      "    }",
      "  },",
      "  \"action_checks\": [],",
      "  \"detector_coverage\": {",
      "    \"registry_version\": \"6\",",
      "    \"registry_sha256\": \"0dac946a95de2c084c76502f7274fad45d757750c8277a052adbfde6a9965317\",",
      "    \"run_policy\": {",
      "      \"schema_version\": \"1\",",
      "      \"public_safety\": {",
      "        \"disposition\": \"required\",",
      "        \"basis\": \"tracked_shippable_surface\",",
      "        \"scope\": \"tracked_shippable\",",
      "        \"tracked_path_count\": 15",
      "      }",
      "    },",
      "    \"run_policy_sha256\": \"c55597eb7c7f38fa48f7684c5c015ad06bb6f2b2b8da998fbe070d51b3beb7b8\",",
      "    \"runtime_identity\": {",
      "      \"record_type\": \"mister-clean.detector-runtime-identity\",",
      "      \"schema_version\": \"1.0\",",
      "      \"status\": \"source_development\",",
      "      \"package\": null,",
      "      \"claimed_source\": null,",
      "      \"manifest\": null,",
      "      \"entrypoint\": {",
      "        \"path\": \"./src/cli.ts\",",
      "        \"sha256\": \"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"",
      "      },",
      "      \"claim_scope\": {",
      "        \"covers\": \"source_entrypoint_regular_file_bytes_only\",",
      "        \"excludes\": [",
      "          \"imported_source_module_graph\",",
      "          \"dependency_resolution_graph\",",
      "          \"runtime_host\"",
      "        ]",
      "      },",
      "      \"reason\": \"prepare golden test source execution\"",
      "    },",
      "    \"runtime_identity_sha256\": \"d33ec667081ffab1e81bd6adda09f44fa856ee9efe19a7ae037cbb8d7b65af59\",",
      "    \"applicability\": [",
      "      {",
      "        \"detector_id\": \"planning_graph\",",
      "        \"disposition\": \"required\",",
      "        \"basis\": \"core_closeout\"",
      "      },",
      "      {",
      "        \"detector_id\": \"public_safety\",",
      "        \"disposition\": \"required\",",
      "        \"basis\": \"tracked_shippable_surface\"",
      "      },",
      "      {",
      "        \"detector_id\": \"github_actions\",",
      "        \"disposition\": \"required\",",
      "        \"basis\": \"core_closeout\"",
      "      },",
      "      {",
      "        \"detector_id\": \"semantic_boundary\",",
      "        \"disposition\": \"required\",",
      "        \"basis\": \"core_closeout\"",
      "      },",
      "      {",
      "        \"detector_id\": \"language_policy\",",
      "        \"disposition\": \"required\",",
      "        \"basis\": \"core_closeout\"",
      "      }",
      "    ],",
      "    \"baseline_object\": \"325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489\",",
      "    \"baseline_repository_object\": {",
      "      \"record_type\": \"mister-clean.repository-object\",",
      "      \"schema_version\": \"1.0\",",
      "      \"head_commit\": \"69bcd8fb1f814918a9c869ff26df1e55504f0b83\",",
      "      \"surface\": \"tracked_and_nonignored\",",
      "      \"entry_count\": 15,",
      "      \"sha256\": \"325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489\"",
      "    },",
      "    \"required_detector_ids\": [",
      "      \"planning_graph\",",
      "      \"public_safety\",",
      "      \"github_actions\",",
      "      \"semantic_boundary\",",
      "      \"language_policy\"",
      "    ],",
      "    \"executions\": [",
      "      {",
      "        \"detector_id\": \"planning_graph\",",
      "        \"phase\": \"baseline\",",
      "        \"object\": \"325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489\",",
      "        \"repository_object\": {",
      "          \"record_type\": \"mister-clean.repository-object\",",
      "          \"schema_version\": \"1.0\",",
      "          \"head_commit\": \"69bcd8fb1f814918a9c869ff26df1e55504f0b83\",",
      "          \"surface\": \"tracked_and_nonignored\",",
      "          \"entry_count\": 15,",
      "          \"sha256\": \"325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489\"",
      "        },",
      "        \"scope\": \".\",",
      "        \"command\": \"mister-clean audit planning . --json\",",
      "        \"command_sha256\": \"12c08dba7549ffcfd939a0885c03e1e562699c348184c99a31909dbeb294f632\",",
      "        \"detector\": \"mister-clean/planning_graph@2\",",
      "        \"detector_registry_sha256\": \"b1ad5b2c31bd9277e028ec0695963e6fa2ec3caed5ef09036ac0980dfe8ff930\",",
      "        \"runtime_identity_sha256\": \"d33ec667081ffab1e81bd6adda09f44fa856ee9efe19a7ae037cbb8d7b65af59\",",
      "        \"input_refs\": [],",
      "        \"result_ref\": {",
      "          \"path\": \"planning-audit.json\",",
      "          \"sha256\": \"c75c11976429616ba7445dd07bc9c42a6c38c62a101cf7793c5ff5bd79b2403b\"",
      "        },",
      "        \"result_sha256\": \"c75c11976429616ba7445dd07bc9c42a6c38c62a101cf7793c5ff5bd79b2403b\",",
      "        \"exit_code\": 1,",
      "        \"observed_at\": \"2026-11-17T00:00:00.000Z\",",
      "        \"finding_fingerprints\": [",
      "          \"3784305a365e50e272322ba35329534bb993dea75a5de43a15a6fe7f3731e48f\"",
      "        ]",
      "      },",
      "      {",
      "        \"detector_id\": \"public_safety\",",
      "        \"phase\": \"baseline\",",
      "        \"object\": \"325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489\",",
      "        \"repository_object\": {",
      "          \"record_type\": \"mister-clean.repository-object\",",
      "          \"schema_version\": \"1.0\",",
      "          \"head_commit\": \"69bcd8fb1f814918a9c869ff26df1e55504f0b83\",",
      "          \"surface\": \"tracked_and_nonignored\",",
      "          \"entry_count\": 15,",
      "          \"sha256\": \"325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489\"",
      "        },",
      "        \"scope\": \"tracked_shippable\",",
      "        \"command\": \"mister-clean audit public-safety . --tracked --json\",",
      "        \"command_sha256\": \"466987d1b525416c8a9c88cdb09bb1f9d9335dd4685e764405cd8d239c2631d5\",",
      "        \"detector\": \"mister-clean/public_safety@1\",",
      "        \"detector_registry_sha256\": \"787b6608a37a891c01fe978f49f3b93a5dceaa9dd2fa53a9a3060797d9fe05d3\",",
      "        \"runtime_identity_sha256\": \"d33ec667081ffab1e81bd6adda09f44fa856ee9efe19a7ae037cbb8d7b65af59\",",
      "        \"input_refs\": [",
      "          {",
      "            \"kind\": \"public_safety_denylist\",",
      "            \"path\": \"public-safety-denylist.txt\",",
      "            \"sha256\": \"0bbe34d8bd3ce1ebabe4dc0eb7ef14fd7fb6ff828b3608496f747bfe904b23f7\"",
      "          }",
      "        ],",
      "        \"result_ref\": {",
      "          \"path\": \"public-safety-audit.json\",",
      "          \"sha256\": \"21713e534ac9c9c4875e922d619ef6a11d6bb6eb529a1992317309b540bb24d5\"",
      "        },",
      "        \"result_sha256\": \"21713e534ac9c9c4875e922d619ef6a11d6bb6eb529a1992317309b540bb24d5\",",
      "        \"exit_code\": 1,",
      "        \"observed_at\": \"2026-11-17T00:00:00.000Z\",",
      "        \"finding_fingerprints\": [",
      "          \"72fd845af66388586b7c4b45e27aa3f990fa6907db183082c8e25999fb196ce8\",",
      "          \"8a99834661dfef6a064737f40cce22d49680f216a4c4adbf2c4474e7881ce866\",",
      "          \"b316b0c2730fe055269883a0f4e392e4039ef6a465f6ca3f86f85c305282c836\",",
      "          \"cdfef1119827779a31b55ea1e907a7fc85f38445b3a7a553b083131ca6750074\",",
      "          \"dd39100d20641895208fb5b544d8dea5afcadd86bd9bc3071355f273a4234135\"",
      "        ]",
      "      },",
      "      {",
      "        \"detector_id\": \"github_actions\",",
      "        \"phase\": \"baseline\",",
      "        \"object\": \"325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489\",",
      "        \"repository_object\": {",
      "          \"record_type\": \"mister-clean.repository-object\",",
      "          \"schema_version\": \"1.0\",",
      "          \"head_commit\": \"69bcd8fb1f814918a9c869ff26df1e55504f0b83\",",
      "          \"surface\": \"tracked_and_nonignored\",",
      "          \"entry_count\": 15,",
      "          \"sha256\": \"325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489\"",
      "        },",
      "        \"scope\": \".\",",
      "        \"command\": \"mister-clean audit github-actions . --json\",",
      "        \"command_sha256\": \"dc67b3546594f48efe4e128ddf689f4fada1af8326846baef3a8cf31434beac8\",",
      "        \"detector\": \"mister-clean/github_actions@3\",",
      "        \"detector_registry_sha256\": \"b2f90a0443f7b0e2065d5a9f9d9251b081fcce763369510973776a0452afa7c4\",",
      "        \"runtime_identity_sha256\": \"d33ec667081ffab1e81bd6adda09f44fa856ee9efe19a7ae037cbb8d7b65af59\",",
      "        \"input_refs\": [],",
      "        \"result_ref\": {",
      "          \"path\": \"github-actions-audit.json\",",
      "          \"sha256\": \"c043de83d1819fe4f5b8aaad5370aac88ce1696b06c7a459e6f4cc19758fbf2b\"",
      "        },",
      "        \"result_sha256\": \"c043de83d1819fe4f5b8aaad5370aac88ce1696b06c7a459e6f4cc19758fbf2b\",",
      "        \"exit_code\": 1,",
      "        \"observed_at\": \"2026-11-17T00:00:00.000Z\",",
      "        \"finding_fingerprints\": [",
      "          \"0df23b92e82a76d39043a7db0c54f9f86db77987cbfd118a44673759a9d055b9\",",
      "          \"2ea8b93c88318e349ab803dc57605280282c5705c2e3efdbf7734895457af199\",",
      "          \"48c917dd897e77b08d346bfe078af8d917a0e121c5df5f74dde5d1feac66cf83\",",
      "          \"6a1d5714eeaaeab542d514b298fdd3e16ac86a247d14dc29fcff076b0a2741a8\",",
      "          \"6c0ba00bc77e89d6c4029f9d96373a9129bbae0f8fbba67f151fb2e33877364d\",",
      "          \"7ec42733f460f66eb2994a029c0ed80a4aa2761d0e60061f4d9b2dcf0bfce62b\",",
      "          \"c0ac098d3965b3e9192663b1e4bf71998be5a766d3ef0c1e01aa99c4fbaa8d5e\",",
      "          \"c138b13948bc202503066f3a7b0398451a9b1cfd6bc564c550979a18a17355d4\",",
      "          \"df72a21beaef99a48d3ab31bcf668708e1d3e93f60596fb9e848425bf8cafb2f\",",
      "          \"e88c3abb48880b83c937699467abfd9b89d7bb4d49d5c5648c25e8665769dfea\"",
      "        ]",
      "      },",
      "      {",
      "        \"detector_id\": \"semantic_boundary\",",
      "        \"phase\": \"baseline\",",
      "        \"object\": \"325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489\",",
      "        \"repository_object\": {",
      "          \"record_type\": \"mister-clean.repository-object\",",
      "          \"schema_version\": \"1.0\",",
      "          \"head_commit\": \"69bcd8fb1f814918a9c869ff26df1e55504f0b83\",",
      "          \"surface\": \"tracked_and_nonignored\",",
      "          \"entry_count\": 15,",
      "          \"sha256\": \"325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489\"",
      "        },",
      "        \"scope\": \".\",",
      "        \"command\": \"mister-clean audit semantic . --json\",",
      "        \"command_sha256\": \"863c2c3a8e9acb3d4859061e0eda748f87fd93cc6b343ab08f7ddb9ffb488481\",",
      "        \"detector\": \"mister-clean/semantic_boundary@1\",",
      "        \"detector_registry_sha256\": \"4c71b4e1ed30476d865b4274934788f64a92dc8ae08e40d9f11749a9921650f5\",",
      "        \"runtime_identity_sha256\": \"d33ec667081ffab1e81bd6adda09f44fa856ee9efe19a7ae037cbb8d7b65af59\",",
      "        \"input_refs\": [],",
      "        \"result_ref\": {",
      "          \"path\": \"semantic-audit.json\",",
      "          \"sha256\": \"859ebd0c7e5e7145b6515c06ecef0c20fe3bd51a3d92c95e4132219e457c09ce\"",
      "        },",
      "        \"result_sha256\": \"859ebd0c7e5e7145b6515c06ecef0c20fe3bd51a3d92c95e4132219e457c09ce\",",
      "        \"exit_code\": 1,",
      "        \"observed_at\": \"2026-11-17T00:00:00.000Z\",",
      "        \"finding_fingerprints\": [",
      "          \"a0ead31c77a8096da420934892a39ac06a8b1170cc7e36a36a2d4e4fa8781d35\",",
      "          \"b3bb2a1539f1126fcdb7c378f264c9caa48fbf4858901480403d656241cc953a\"",
      "        ]",
      "      },",
      "      {",
      "        \"detector_id\": \"language_policy\",",
      "        \"phase\": \"baseline\",",
      "        \"object\": \"325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489\",",
      "        \"repository_object\": {",
      "          \"record_type\": \"mister-clean.repository-object\",",
      "          \"schema_version\": \"1.0\",",
      "          \"head_commit\": \"69bcd8fb1f814918a9c869ff26df1e55504f0b83\",",
      "          \"surface\": \"tracked_and_nonignored\",",
      "          \"entry_count\": 15,",
      "          \"sha256\": \"325cfdafa5caf7646395d7d1fc9954c69d586e813e2ed0b8e0b58678f870f489\"",
      "        },",
      "        \"scope\": \"tracked_shippable\",",
      "        \"command\": \"mister-clean audit language-policy . --json\",",
      "        \"command_sha256\": \"b5cb70ffb72a8459fbbcf58ad6c58ca93e95d0969223c598e0aa68da2cf94d5e\",",
      "        \"detector\": \"mister-clean/language_policy@1\",",
      "        \"detector_registry_sha256\": \"9bf191dc7a68b06e86ee3f336b4ae70f84968ea4a6633bd8e985678634380cd0\",",
      "        \"runtime_identity_sha256\": \"d33ec667081ffab1e81bd6adda09f44fa856ee9efe19a7ae037cbb8d7b65af59\",",
      "        \"input_refs\": [],",
      "        \"result_ref\": {",
      "          \"path\": \"language-policy-audit.json\",",
      "          \"sha256\": \"20f6f45488f00116a1cab2906db8960f84a0dec2186855f6ee9888966127f016\"",
      "        },",
      "        \"result_sha256\": \"20f6f45488f00116a1cab2906db8960f84a0dec2186855f6ee9888966127f016\",",
      "        \"exit_code\": 1,",
      "        \"observed_at\": \"2026-11-17T00:00:00.000Z\",",
      "        \"finding_fingerprints\": [",
      "          \"6158de9572bc94c15f65ba3e2d24133136fdb73c7472e0defb900d057c5a6012\"",
      "        ]",
      "      }",
      "    ],",
      "    \"finding_fingerprints\": [",
      "      \"0df23b92e82a76d39043a7db0c54f9f86db77987cbfd118a44673759a9d055b9\",",
      "      \"2ea8b93c88318e349ab803dc57605280282c5705c2e3efdbf7734895457af199\",",
      "      \"3784305a365e50e272322ba35329534bb993dea75a5de43a15a6fe7f3731e48f\",",
      "      \"48c917dd897e77b08d346bfe078af8d917a0e121c5df5f74dde5d1feac66cf83\",",
      "      \"6158de9572bc94c15f65ba3e2d24133136fdb73c7472e0defb900d057c5a6012\",",
      "      \"6a1d5714eeaaeab542d514b298fdd3e16ac86a247d14dc29fcff076b0a2741a8\",",
      "      \"6c0ba00bc77e89d6c4029f9d96373a9129bbae0f8fbba67f151fb2e33877364d\",",
      "      \"72fd845af66388586b7c4b45e27aa3f990fa6907db183082c8e25999fb196ce8\",",
      "      \"7ec42733f460f66eb2994a029c0ed80a4aa2761d0e60061f4d9b2dcf0bfce62b\",",
      "      \"8a99834661dfef6a064737f40cce22d49680f216a4c4adbf2c4474e7881ce866\",",
      "      \"a0ead31c77a8096da420934892a39ac06a8b1170cc7e36a36a2d4e4fa8781d35\",",
      "      \"b316b0c2730fe055269883a0f4e392e4039ef6a465f6ca3f86f85c305282c836\",",
      "      \"b3bb2a1539f1126fcdb7c378f264c9caa48fbf4858901480403d656241cc953a\",",
      "      \"c0ac098d3965b3e9192663b1e4bf71998be5a766d3ef0c1e01aa99c4fbaa8d5e\",",
      "      \"c138b13948bc202503066f3a7b0398451a9b1cfd6bc564c550979a18a17355d4\",",
      "      \"cdfef1119827779a31b55ea1e907a7fc85f38445b3a7a553b083131ca6750074\",",
      "      \"dd39100d20641895208fb5b544d8dea5afcadd86bd9bc3071355f273a4234135\",",
      "      \"df72a21beaef99a48d3ab31bcf668708e1d3e93f60596fb9e848425bf8cafb2f\",",
      "      \"e88c3abb48880b83c937699467abfd9b89d7bb4d49d5c5648c25e8665769dfea\"",
      "    ]",
      "  }",
      "}",
      ""
    ]
  },
  "semantic-confirmed": {
    "report": {
      "completion_debts": [
        {
          "id": "DEBT-SEMANTIC-ABF29FE8F6E92EFE",
          "class": "mechanism_unwired_at_composition_root",
          "observation_count": 1,
          "detector_finding_fingerprints": [
            "8d55ffcc2fa81de58c99667abfef46f63d660495f38680430adaa910ba34b49d"
          ],
          "affected_paths": [
            "planning/SECURITY.md"
          ],
          "repair_boundary": "candidate:SEM-COMPOSITION-4D2BEFDFF9C4",
          "procedure": "Repair composition root reachability and rerun its bound semantic probe",
          "state": "open",
          "disposition": "autonomously_repair",
          "evidence": [
            {
              "kind": "gate_result",
              "object": "10e58182ff981f2ed06ab24d951877e08d39c142b97975d92263feae63eb85c6",
              "command": "mister-clean audit semantic . --manifest semantic-probe-manifest.json --execute --json",
              "result": "mechanism_unwired_at_composition_root: credential validator -> composition root failed cases: wired",
              "observed_at": "2026-11-17T00:00:00.000Z",
              "evidence_ref": {
                "path": "semantic-audit.json",
                "sha256": "0336dae37f0d0131873896232395568d76e8bbb5ca2048107853a9495e60b03a"
              }
            }
          ],
          "debt_key": "26e42a79cb9e04de0f1c776b2e0fb1b3fad45cb4fe419d8427f95aa6e945f48b",
          "normalizer": "mister-clean/semantic-root@1",
          "cause_key": {
            "detector_family": "semantic_boundary",
            "candidate_id": "SEM-COMPOSITION-4D2BEFDFF9C4",
            "code": "mechanism_unwired_at_composition_root"
          },
          "observation_ids": [
            "532c9f6acf431d91bec43243915cd914019cb45031429710ed48fd477a3dada5"
          ],
          "origin": {
            "class": "baseline"
          }
        },
        {
          "id": "DEBT-SEMANTIC-2BBFE3C93B9C2C03",
          "class": "semantic_probe_operate_time_pending",
          "observation_count": 1,
          "detector_finding_fingerprints": [
            "a3a0fc90fd6d16229e39c9671380a173ee59a97757a158a3f85e86859a4dfa09"
          ],
          "affected_paths": [
            "planning/SECURITY.md"
          ],
          "repair_boundary": "candidate:SEM-CONSTRUCTION-D2C93164B187",
          "procedure": "Execute and record the owned operate-time proof for SEM-CONSTRUCTION-D2C93164B187",
          "state": "open",
          "disposition": "decision_or_coordination_required",
          "evidence": [
            {
              "kind": "gate_result",
              "object": "10e58182ff981f2ed06ab24d951877e08d39c142b97975d92263feae63eb85c6",
              "command": "mister-clean audit semantic . --manifest semantic-probe-manifest.json --execute --json",
              "result": "semantic_probe_operate_time_pending: observe the deployed validator; owner=operator; evidence=a production trace",
              "observed_at": "2026-11-17T00:00:00.000Z",
              "evidence_ref": {
                "path": "semantic-audit.json",
                "sha256": "0336dae37f0d0131873896232395568d76e8bbb5ca2048107853a9495e60b03a"
              }
            }
          ],
          "debt_key": "9f0172c461c649fcd731ee1a556fc7e3ed5a96f050142ba62ed71d4e72b0edcb",
          "normalizer": "mister-clean/semantic-root@1",
          "cause_key": {
            "detector_family": "semantic_boundary",
            "candidate_id": "SEM-CONSTRUCTION-D2C93164B187",
            "code": "semantic_probe_operate_time_pending"
          },
          "observation_ids": [
            "524daafe99af78e44c5ad6d66f312e0e60c3a757b1b0f76580d5d31adc2382c4"
          ],
          "origin": {
            "class": "baseline"
          }
        }
      ],
      "retirement_applications": [],
      "debt_census": {
        "discovered": 2,
        "paid": 0,
        "accepted_exception": 0
      },
      "public_safety_debt_accounting": {
        "debt_count": 0,
        "exempted_finding_count": 0
      },
      "planning_accounting": {
        "raw_finding_count": 0,
        "root_debt_count": 0,
        "suppressed_by_typed_nonartifact_count": 0,
        "candidate_probe_count": 0,
        "evidence_ref": {
          "path": "planning-audit.json",
          "sha256": "52428cb958f4026409c1c3308ad2c2541b11623eb47a809fe176e9dc62de9a23"
        }
      },
      "public_safety_accounting": {
        "tracked_path_count": 1,
        "finding_count": 0,
        "unassessed_count": 0,
        "exempted_count": 0,
        "evidence_ref": {
          "path": "public-safety-audit.json",
          "sha256": "4360b9c912f6e6fba0e1cc3d3f5e8df87f4bc81e01fd0ec4034ce700bdadeef7"
        }
      },
      "github_actions_accounting": {
        "workflow_count": 0,
        "sensitive_workflow_count": 0,
        "finding_count": 0,
        "root_debt_count": 0,
        "evidence_ref": {
          "path": "github-actions-audit.json",
          "sha256": "f1a330fc901309d1f8e46705cd0f3b1c4f4f7eca845027cfb3780b683ada027f"
        }
      },
      "language_policy_accounting": {
        "status": "not_applicable",
        "tracked_path_count": 0,
        "finding_count": 0,
        "generated_exempt_count": 0,
        "allowed_count": 0,
        "root_debt_count": 0,
        "evidence_ref": {
          "path": "language-policy-audit.json",
          "sha256": "c6996a130a1bbeb02cbaa8e86e55c6522b3bd0315a370203ae7a8d1841d11619"
        }
      },
      "semantic_accounting": {
        "candidate_probe_count": 2,
        "executed_probe_count": 1,
        "resolved_probe_count": 0,
        "confirmed_failure_count": 1,
        "pending_probe_count": 1,
        "finding_count": 2,
        "evidence_ref": {
          "path": "semantic-audit.json",
          "sha256": "0336dae37f0d0131873896232395568d76e8bbb5ca2048107853a9495e60b03a"
        }
      }
    },
    "regression_delta_lines": [
      "{",
      "  \"record_type\": \"mister-clean.regression-delta\",",
      "  \"schema_version\": \"1.6\",",
      "  \"policy\": \"zero_open_run_introduced_debt\",",
      "  \"baseline_object\": \"10e58182ff981f2ed06ab24d951877e08d39c142b97975d92263feae63eb85c6\",",
      "  \"baseline_repository_object\": {",
      "    \"record_type\": \"mister-clean.repository-object\",",
      "    \"schema_version\": \"1.0\",",
      "    \"head_commit\": \"26173f158b406c21718df834aaf95d87749da5aa\",",
      "    \"surface\": \"tracked_and_nonignored\",",
      "    \"entry_count\": 1,",
      "    \"sha256\": \"10e58182ff981f2ed06ab24d951877e08d39c142b97975d92263feae63eb85c6\"",
      "  },",
      "  \"closing_object\": \"10e58182ff981f2ed06ab24d951877e08d39c142b97975d92263feae63eb85c6\",",
      "  \"closing_repository_object\": {",
      "    \"record_type\": \"mister-clean.repository-object\",",
      "    \"schema_version\": \"1.0\",",
      "    \"head_commit\": \"26173f158b406c21718df834aaf95d87749da5aa\",",
      "    \"surface\": \"tracked_and_nonignored\",",
      "    \"entry_count\": 1,",
      "    \"sha256\": \"10e58182ff981f2ed06ab24d951877e08d39c142b97975d92263feae63eb85c6\"",
      "  },",
      "  \"accounting\": {",
      "    \"schema_version\": \"1.5\",",
      "    \"observation_ledger\": {",
      "      \"identity_scheme\": \"mister-clean.observation.v1\",",
      "      \"ledger_sha256\": \"03148e4f4c78da797c9dc680c72cb1cea2fc7a5613f4c178ed8a5731e3668a25\",",
      "      \"baseline_observation_ids\": [",
      "        \"524daafe99af78e44c5ad6d66f312e0e60c3a757b1b0f76580d5d31adc2382c4\",",
      "        \"532c9f6acf431d91bec43243915cd914019cb45031429710ed48fd477a3dada5\"",
      "      ],",
      "      \"closing_observation_ids\": [",
      "        \"524daafe99af78e44c5ad6d66f312e0e60c3a757b1b0f76580d5d31adc2382c4\",",
      "        \"532c9f6acf431d91bec43243915cd914019cb45031429710ed48fd477a3dada5\"",
      "      ],",
      "      \"observed_observation_ids\": [",
      "        \"524daafe99af78e44c5ad6d66f312e0e60c3a757b1b0f76580d5d31adc2382c4\",",
      "        \"532c9f6acf431d91bec43243915cd914019cb45031429710ed48fd477a3dada5\"",
      "      ]",
      "    },",
      "    \"root_debt_ledger\": {",
      "      \"identity_scheme\": \"mister-clean.root-debt.v1\",",
      "      \"ledger_sha256\": \"a61aba161ddcb13b747475202e03dcce5e18cc9989175e19ef99325979585da5\",",
      "      \"baseline_present_debt_keys\": [",
      "        \"26e42a79cb9e04de0f1c776b2e0fb1b3fad45cb4fe419d8427f95aa6e945f48b\",",
      "        \"9f0172c461c649fcd731ee1a556fc7e3ed5a96f050142ba62ed71d4e72b0edcb\"",
      "      ],",
      "      \"closing_present_debt_keys\": [",
      "        \"26e42a79cb9e04de0f1c776b2e0fb1b3fad45cb4fe419d8427f95aa6e945f48b\",",
      "        \"9f0172c461c649fcd731ee1a556fc7e3ed5a96f050142ba62ed71d4e72b0edcb\"",
      "      ]",
      "    }",
      "  },",
      "  \"action_checks\": [],",
      "  \"detector_coverage\": {",
      "    \"registry_version\": \"6\",",
      "    \"registry_sha256\": \"0dac946a95de2c084c76502f7274fad45d757750c8277a052adbfde6a9965317\",",
      "    \"run_policy\": {",
      "      \"schema_version\": \"1\",",
      "      \"public_safety\": {",
      "        \"disposition\": \"required\",",
      "        \"basis\": \"tracked_shippable_surface\",",
      "        \"scope\": \"tracked_shippable\",",
      "        \"tracked_path_count\": 1",
      "      }",
      "    },",
      "    \"run_policy_sha256\": \"d72ce74aad3703fee34092c605d6cdd4a6b7f3c60b29c715851f8b4e90b84b50\",",
      "    \"runtime_identity\": {",
      "      \"record_type\": \"mister-clean.detector-runtime-identity\",",
      "      \"schema_version\": \"1.0\",",
      "      \"status\": \"source_development\",",
      "      \"package\": null,",
      "      \"claimed_source\": null,",
      "      \"manifest\": null,",
      "      \"entrypoint\": {",
      "        \"path\": \"./src/cli.ts\",",
      "        \"sha256\": \"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"",
      "      },",
      "      \"claim_scope\": {",
      "        \"covers\": \"source_entrypoint_regular_file_bytes_only\",",
      "        \"excludes\": [",
      "          \"imported_source_module_graph\",",
      "          \"dependency_resolution_graph\",",
      "          \"runtime_host\"",
      "        ]",
      "      },",
      "      \"reason\": \"prepare golden test source execution\"",
      "    },",
      "    \"runtime_identity_sha256\": \"d33ec667081ffab1e81bd6adda09f44fa856ee9efe19a7ae037cbb8d7b65af59\",",
      "    \"applicability\": [",
      "      {",
      "        \"detector_id\": \"planning_graph\",",
      "        \"disposition\": \"required\",",
      "        \"basis\": \"core_closeout\"",
      "      },",
      "      {",
      "        \"detector_id\": \"public_safety\",",
      "        \"disposition\": \"required\",",
      "        \"basis\": \"tracked_shippable_surface\"",
      "      },",
      "      {",
      "        \"detector_id\": \"github_actions\",",
      "        \"disposition\": \"required\",",
      "        \"basis\": \"core_closeout\"",
      "      },",
      "      {",
      "        \"detector_id\": \"semantic_boundary\",",
      "        \"disposition\": \"required\",",
      "        \"basis\": \"core_closeout\"",
      "      },",
      "      {",
      "        \"detector_id\": \"language_policy\",",
      "        \"disposition\": \"required\",",
      "        \"basis\": \"core_closeout\"",
      "      }",
      "    ],",
      "    \"baseline_object\": \"10e58182ff981f2ed06ab24d951877e08d39c142b97975d92263feae63eb85c6\",",
      "    \"baseline_repository_object\": {",
      "      \"record_type\": \"mister-clean.repository-object\",",
      "      \"schema_version\": \"1.0\",",
      "      \"head_commit\": \"26173f158b406c21718df834aaf95d87749da5aa\",",
      "      \"surface\": \"tracked_and_nonignored\",",
      "      \"entry_count\": 1,",
      "      \"sha256\": \"10e58182ff981f2ed06ab24d951877e08d39c142b97975d92263feae63eb85c6\"",
      "    },",
      "    \"required_detector_ids\": [",
      "      \"planning_graph\",",
      "      \"public_safety\",",
      "      \"github_actions\",",
      "      \"semantic_boundary\",",
      "      \"language_policy\"",
      "    ],",
      "    \"executions\": [",
      "      {",
      "        \"detector_id\": \"planning_graph\",",
      "        \"phase\": \"baseline\",",
      "        \"object\": \"10e58182ff981f2ed06ab24d951877e08d39c142b97975d92263feae63eb85c6\",",
      "        \"repository_object\": {",
      "          \"record_type\": \"mister-clean.repository-object\",",
      "          \"schema_version\": \"1.0\",",
      "          \"head_commit\": \"26173f158b406c21718df834aaf95d87749da5aa\",",
      "          \"surface\": \"tracked_and_nonignored\",",
      "          \"entry_count\": 1,",
      "          \"sha256\": \"10e58182ff981f2ed06ab24d951877e08d39c142b97975d92263feae63eb85c6\"",
      "        },",
      "        \"scope\": \".\",",
      "        \"command\": \"mister-clean audit planning . --json\",",
      "        \"command_sha256\": \"12c08dba7549ffcfd939a0885c03e1e562699c348184c99a31909dbeb294f632\",",
      "        \"detector\": \"mister-clean/planning_graph@2\",",
      "        \"detector_registry_sha256\": \"b1ad5b2c31bd9277e028ec0695963e6fa2ec3caed5ef09036ac0980dfe8ff930\",",
      "        \"runtime_identity_sha256\": \"d33ec667081ffab1e81bd6adda09f44fa856ee9efe19a7ae037cbb8d7b65af59\",",
      "        \"input_refs\": [],",
      "        \"result_ref\": {",
      "          \"path\": \"planning-audit.json\",",
      "          \"sha256\": \"52428cb958f4026409c1c3308ad2c2541b11623eb47a809fe176e9dc62de9a23\"",
      "        },",
      "        \"result_sha256\": \"52428cb958f4026409c1c3308ad2c2541b11623eb47a809fe176e9dc62de9a23\",",
      "        \"exit_code\": 0,",
      "        \"observed_at\": \"2026-11-17T00:00:00.000Z\",",
      "        \"finding_fingerprints\": []",
      "      },",
      "      {",
      "        \"detector_id\": \"public_safety\",",
      "        \"phase\": \"baseline\",",
      "        \"object\": \"10e58182ff981f2ed06ab24d951877e08d39c142b97975d92263feae63eb85c6\",",
      "        \"repository_object\": {",
      "          \"record_type\": \"mister-clean.repository-object\",",
      "          \"schema_version\": \"1.0\",",
      "          \"head_commit\": \"26173f158b406c21718df834aaf95d87749da5aa\",",
      "          \"surface\": \"tracked_and_nonignored\",",
      "          \"entry_count\": 1,",
      "          \"sha256\": \"10e58182ff981f2ed06ab24d951877e08d39c142b97975d92263feae63eb85c6\"",
      "        },",
      "        \"scope\": \"tracked_shippable\",",
      "        \"command\": \"mister-clean audit public-safety . --tracked --json\",",
      "        \"command_sha256\": \"466987d1b525416c8a9c88cdb09bb1f9d9335dd4685e764405cd8d239c2631d5\",",
      "        \"detector\": \"mister-clean/public_safety@1\",",
      "        \"detector_registry_sha256\": \"787b6608a37a891c01fe978f49f3b93a5dceaa9dd2fa53a9a3060797d9fe05d3\",",
      "        \"runtime_identity_sha256\": \"d33ec667081ffab1e81bd6adda09f44fa856ee9efe19a7ae037cbb8d7b65af59\",",
      "        \"input_refs\": [],",
      "        \"result_ref\": {",
      "          \"path\": \"public-safety-audit.json\",",
      "          \"sha256\": \"4360b9c912f6e6fba0e1cc3d3f5e8df87f4bc81e01fd0ec4034ce700bdadeef7\"",
      "        },",
      "        \"result_sha256\": \"4360b9c912f6e6fba0e1cc3d3f5e8df87f4bc81e01fd0ec4034ce700bdadeef7\",",
      "        \"exit_code\": 0,",
      "        \"observed_at\": \"2026-11-17T00:00:00.000Z\",",
      "        \"finding_fingerprints\": []",
      "      },",
      "      {",
      "        \"detector_id\": \"github_actions\",",
      "        \"phase\": \"baseline\",",
      "        \"object\": \"10e58182ff981f2ed06ab24d951877e08d39c142b97975d92263feae63eb85c6\",",
      "        \"repository_object\": {",
      "          \"record_type\": \"mister-clean.repository-object\",",
      "          \"schema_version\": \"1.0\",",
      "          \"head_commit\": \"26173f158b406c21718df834aaf95d87749da5aa\",",
      "          \"surface\": \"tracked_and_nonignored\",",
      "          \"entry_count\": 1,",
      "          \"sha256\": \"10e58182ff981f2ed06ab24d951877e08d39c142b97975d92263feae63eb85c6\"",
      "        },",
      "        \"scope\": \".\",",
      "        \"command\": \"mister-clean audit github-actions . --json\",",
      "        \"command_sha256\": \"dc67b3546594f48efe4e128ddf689f4fada1af8326846baef3a8cf31434beac8\",",
      "        \"detector\": \"mister-clean/github_actions@3\",",
      "        \"detector_registry_sha256\": \"b2f90a0443f7b0e2065d5a9f9d9251b081fcce763369510973776a0452afa7c4\",",
      "        \"runtime_identity_sha256\": \"d33ec667081ffab1e81bd6adda09f44fa856ee9efe19a7ae037cbb8d7b65af59\",",
      "        \"input_refs\": [],",
      "        \"result_ref\": {",
      "          \"path\": \"github-actions-audit.json\",",
      "          \"sha256\": \"f1a330fc901309d1f8e46705cd0f3b1c4f4f7eca845027cfb3780b683ada027f\"",
      "        },",
      "        \"result_sha256\": \"f1a330fc901309d1f8e46705cd0f3b1c4f4f7eca845027cfb3780b683ada027f\",",
      "        \"exit_code\": 0,",
      "        \"observed_at\": \"2026-11-17T00:00:00.000Z\",",
      "        \"finding_fingerprints\": []",
      "      },",
      "      {",
      "        \"detector_id\": \"semantic_boundary\",",
      "        \"phase\": \"baseline\",",
      "        \"object\": \"10e58182ff981f2ed06ab24d951877e08d39c142b97975d92263feae63eb85c6\",",
      "        \"repository_object\": {",
      "          \"record_type\": \"mister-clean.repository-object\",",
      "          \"schema_version\": \"1.0\",",
      "          \"head_commit\": \"26173f158b406c21718df834aaf95d87749da5aa\",",
      "          \"surface\": \"tracked_and_nonignored\",",
      "          \"entry_count\": 1,",
      "          \"sha256\": \"10e58182ff981f2ed06ab24d951877e08d39c142b97975d92263feae63eb85c6\"",
      "        },",
      "        \"scope\": \".\",",
      "        \"command\": \"mister-clean audit semantic . --json\",",
      "        \"command_sha256\": \"863c2c3a8e9acb3d4859061e0eda748f87fd93cc6b343ab08f7ddb9ffb488481\",",
      "        \"detector\": \"mister-clean/semantic_boundary@1\",",
      "        \"detector_registry_sha256\": \"4c71b4e1ed30476d865b4274934788f64a92dc8ae08e40d9f11749a9921650f5\",",
      "        \"runtime_identity_sha256\": \"d33ec667081ffab1e81bd6adda09f44fa856ee9efe19a7ae037cbb8d7b65af59\",",
      "        \"input_refs\": [",
      "          {",
      "            \"kind\": \"semantic_probe_manifest\",",
      "            \"path\": \"semantic-probe-manifest.json\",",
      "            \"sha256\": \"20883e00746858156eb3e5e2fa877f3d4c0b35f0a729e5e528a6d6cbb72803a9\"",
      "          }",
      "        ],",
      "        \"result_ref\": {",
      "          \"path\": \"semantic-audit.json\",",
      "          \"sha256\": \"0336dae37f0d0131873896232395568d76e8bbb5ca2048107853a9495e60b03a\"",
      "        },",
      "        \"result_sha256\": \"0336dae37f0d0131873896232395568d76e8bbb5ca2048107853a9495e60b03a\",",
      "        \"exit_code\": 1,",
      "        \"observed_at\": \"2026-11-17T00:00:00.000Z\",",
      "        \"finding_fingerprints\": [",
      "          \"8d55ffcc2fa81de58c99667abfef46f63d660495f38680430adaa910ba34b49d\",",
      "          \"a3a0fc90fd6d16229e39c9671380a173ee59a97757a158a3f85e86859a4dfa09\"",
      "        ]",
      "      },",
      "      {",
      "        \"detector_id\": \"language_policy\",",
      "        \"phase\": \"baseline\",",
      "        \"object\": \"10e58182ff981f2ed06ab24d951877e08d39c142b97975d92263feae63eb85c6\",",
      "        \"repository_object\": {",
      "          \"record_type\": \"mister-clean.repository-object\",",
      "          \"schema_version\": \"1.0\",",
      "          \"head_commit\": \"26173f158b406c21718df834aaf95d87749da5aa\",",
      "          \"surface\": \"tracked_and_nonignored\",",
      "          \"entry_count\": 1,",
      "          \"sha256\": \"10e58182ff981f2ed06ab24d951877e08d39c142b97975d92263feae63eb85c6\"",
      "        },",
      "        \"scope\": \"tracked_shippable\",",
      "        \"command\": \"mister-clean audit language-policy . --json\",",
      "        \"command_sha256\": \"b5cb70ffb72a8459fbbcf58ad6c58ca93e95d0969223c598e0aa68da2cf94d5e\",",
      "        \"detector\": \"mister-clean/language_policy@1\",",
      "        \"detector_registry_sha256\": \"9bf191dc7a68b06e86ee3f336b4ae70f84968ea4a6633bd8e985678634380cd0\",",
      "        \"runtime_identity_sha256\": \"d33ec667081ffab1e81bd6adda09f44fa856ee9efe19a7ae037cbb8d7b65af59\",",
      "        \"input_refs\": [],",
      "        \"result_ref\": {",
      "          \"path\": \"language-policy-audit.json\",",
      "          \"sha256\": \"c6996a130a1bbeb02cbaa8e86e55c6522b3bd0315a370203ae7a8d1841d11619\"",
      "        },",
      "        \"result_sha256\": \"c6996a130a1bbeb02cbaa8e86e55c6522b3bd0315a370203ae7a8d1841d11619\",",
      "        \"exit_code\": 0,",
      "        \"observed_at\": \"2026-11-17T00:00:00.000Z\",",
      "        \"finding_fingerprints\": []",
      "      }",
      "    ],",
      "    \"finding_fingerprints\": [",
      "      \"8d55ffcc2fa81de58c99667abfef46f63d660495f38680430adaa910ba34b49d\",",
      "      \"a3a0fc90fd6d16229e39c9671380a173ee59a97757a158a3f85e86859a4dfa09\"",
      "    ]",
      "  }",
      "}",
      ""
    ]
  }
};
