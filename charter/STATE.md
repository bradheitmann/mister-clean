# State — mister-clean — 2026-11-06T11:40Z (approximate; written by the project PM, Claude Code, in the merge that lands mg-forward-752)
HEAD: 65ae899df25598aa884af6ec7b088e4e4bd0d971 (main before this merge). Every claim below was verified when written; successors compare before trusting a line.
ACTIVE (owner, 2026-11-06: "bring the 7.5.2 fix into main, then do S1C and S2, and then commit and push again"). Order: mg-ci-green-1 (landed 8013fd3), mg-forward-752 (this merge), then mg-s1c-os-sandbox, then S2 (mg-s2a-codecs first). The park handoff stays the resume baseline: project/planning/handoffs/HANDOFF-2026-11-06-PARK.md on branch handoff/park-20261106 (final handoff commit 08fa859).
Proven (with the proof names):
- Fleet pin: v7.5.1 (a47c00d), installed and attested in every agent skill directory; npm latest.
- v7.5.2 (tag on 1d06f2a; release line release/7.5.x): the byte-order fixes, accepted through the full charter lifecycle. dsgncrsh installs it.
- On main, unreleased: master-gate S0 trust root (e00b19c), S1 execution safety (3d46c86), S1b git/env hardening (d547fc5), mg-pii-name-1 (f44fe0e), and trust policy v3 (4240c0e; the owner key holds the principal role, charter/owner-decisions/2026-11-06-owner-key-principal-role.md).
- mg-forward-752, landed by this merge: the 7.5.2 byte-order fixes (source_refs and runner findings sort by UTF-8 bytes, not locale collation) on main, with explicit 120 s test timeouts. Cross-family receipt by CH/QA xiaomi/mimo-v2.6-flash (proofs 1–6, re-frozen head d2da4d7); hosted CI verify run 42203311538: success; pre-merge self-judge mg-forward-752-selfjudge-1: no debt class beyond the baseline (the campaign-observer importer flake recurred in the gate snapshot and passed 6 of 6 standalone reruns on the candidate and on main).
- mg-ci-green-1 (8013fd3). Main's required CI job `verify` had been red since 4c236c9, because the public-safety rule `file-url` matched a bare scheme in accepted S1b QA prose. The rule now needs a host or path after the scheme, with near-miss tests; the accepted receipt is unchanged. Cross-family receipt by CH/QA xiaomi/mimo-v2.6-flash (proofs 1–5); hosted CI verify run 42194192164: success; pre-merge self-judge mg-ci-green-1-selfjudge-1: no new debt class.
Not proven / known gaps:
- 7.5.1's CLEAN rested partly on unverified closer-written records (A4-1, A4-2, A4-16). S0 fixed main in part; S4 finishes it.
- Charter lifecycle deviations: S0 and S1 ran without the full lifecycle; S1b's acceptance records sit on its branch. Every slice since mg-release-7.5.2 uses the canonical shape.
- The pinned 7.5.1 judge still flags bare file schemes, so its self-judge shows two such instances in charter/DONE/mg-ci-green-1.md. They are a baseline class, and the fixed rule (this merge) does not flag them.
- Node v26.12.0 (this host's Homebrew node) mis-keys escaped object keys in JSON.parse after warm-up: 171278 of 200000 round trips in the repro. Node 22 (CI and the judge container) and bun 1.4.0 are clean. The installed 7.5.1 runs on node 26 here. Planned: slice mg-node-json-guard (an engine self-test that fails closed).
- Pre-existing: control-plane sqlite/HTTP tests time out under load in the container (self-judge gate debt DEBT-NATIVE-GATE-17ED5EBED7B18D8C); owned by S6.
- Every new commit needs a fresh SEM-EXECUTABLE attestation (S4).
Exact last-green command(s):
- `charter receipt qa/mg-forward-752/receipt.json --verify-tree <mg/forward-752 at 69709ec>` matched the recorded freeze; `charter gate mg-forward-752 --accept --receipt qa/mg-forward-752/receipt.json`: accepted.
- hosted CI verify run 42203311538 (branch mg/forward-752, head 69709ec): success; main 8013fd3 run 42203080467: verify success.
Exact last-red command(s) and why:
- self-judge mg-forward-752-selfjudge-1: native gate cargo campaign-observer red (importer flake in the node_modules-free snapshot, owned by S6) and node ci-check red (control-plane load timeouts, owned by S6). Both are baseline.
- CH/QA proof-6 task, first attempt: provider content_filter (no verdict); the reworded retry was accepted.
Next three bounded items (in order):
1. mg-s1c-os-sandbox (PR #90): merge main (with mg-forward-752), re-freeze, Linux container run (proof 2) and self-judge (admission from A/EXEC-PM), cross-family QA, land. The PM ruling on the proof-6 mutant is in the PM private slice notes; QA confirms it.
2. mg-s2a-codecs (DEV head ddf84fe, waiting for the main merge): merge main, re-run proofs, freeze, cross-family QA, self-judge, land.
3. mg-node-json-guard: an engine JSON round-trip self-test that fails closed, plus a package.json engines range; also the QA obligations CHQA-D3 (proof-4 reopen on an unbuilt checkout) and CHQA-D5 (a bare tsc resolves to a global TypeScript 5.9).
Open owner decisions:
- A package split of the control plane and Worker out of the CLI package (recommended as S9, after S2).
- Slice Zero redesign scope (recommended: option 2, an end-to-end judge-minted fixture run).
- Filing the Node v26 JSON.parse defect upstream, and whether to pin this host's node to 22.
- Submitting the prepared GitHub Support purge request for the cached commit and pull-request ref.
