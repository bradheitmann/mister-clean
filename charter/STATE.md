# State — mister-clean — 2026-11-06T10:40Z (approximate; written by the project PM, Claude Code, in the merge that lands mg-ci-green-1)
HEAD: 4240c0e6bc460152b8b9e3c14e5683c5745a7910 (main before this merge). Every claim below was verified when written; successors compare before trusting a line.
ACTIVE (owner, 2026-11-06: "bring the 7.5.2 fix into main, then do S1C and S2, and then commit and push again"). Order: mg-ci-green-1 (this merge), then mg-forward-752 re-frozen on top of it, then mg-s1c-os-sandbox, then S2 (mg-s2a-codecs first). The park handoff stays the resume baseline: project/planning/handoffs/HANDOFF-2026-11-06-PARK.md on branch handoff/park-20261106 (final handoff commit 08fa859).
Proven (with the proof names):
- Fleet pin: v7.5.1 (a47c00d), installed and attested in every agent skill directory; npm latest.
- v7.5.2 (tag on 1d06f2a; release line release/7.5.x): the byte-order fixes, accepted through the full charter lifecycle. dsgncrsh installs it.
- On main, unreleased: master-gate S0 trust root (e00b19c), S1 execution safety (3d46c86), S1b git/env hardening (d547fc5), mg-pii-name-1 (f44fe0e), and trust policy v3 (4240c0e; the owner key holds the principal role, charter/owner-decisions/2026-11-06-owner-key-principal-role.md).
- mg-ci-green-1, landed by this merge. Main's required CI job `verify` had been red since 4c236c9, because the public-safety rule `file-url` matched a bare scheme in accepted S1b QA prose. The rule now needs a host or path after the scheme, with near-miss tests; the accepted receipt is unchanged. Cross-family receipt by CH/QA xiaomi/mimo-v2.6-flash (proofs 1–5); hosted CI verify run 42194192164: success; pre-merge self-judge mg-ci-green-1-selfjudge-1: no new debt class.
Not proven / known gaps:
- 7.5.1's CLEAN rested partly on unverified closer-written records (A4-1, A4-2, A4-16). S0 fixed main in part; S4 finishes it.
- Charter lifecycle deviations: S0 and S1 ran without the full lifecycle; S1b's acceptance records sit on its branch. Every slice since mg-release-7.5.2 uses the canonical shape.
- The pinned 7.5.1 judge still flags bare file schemes, so its self-judge shows two such instances in charter/DONE/mg-ci-green-1.md. They are a baseline class, and the fixed rule (this merge) does not flag them.
- Node v26.12.0 (this host's Homebrew node) mis-keys escaped object keys in JSON.parse after warm-up: 171278 of 200000 round trips in the repro. Node 22 (CI and the judge container) and bun 1.4.0 are clean. The installed 7.5.1 runs on node 26 here. Planned: slice mg-node-json-guard (an engine self-test that fails closed).
- Pre-existing: control-plane sqlite/HTTP tests time out under load in the container (self-judge gate debt DEBT-NATIVE-GATE-17ED5EBED7B18D8C); owned by S6.
- Every new commit needs a fresh SEM-EXECUTABLE attestation (S4).
Exact last-green command(s):
- `charter receipt qa/mg-ci-green-1/receipt.json --verify-tree <mg/ci-green-1 at a419bdb>` matched the recorded freeze; `charter gate mg-ci-green-1 --accept --receipt qa/mg-ci-green-1/receipt.json`: accepted.
- hosted CI verify run 42194192164 (branch mg/ci-green-1, head a419bdb): success.
Exact last-red command(s) and why:
- hosted CI verify on main 4240c0e (run 42188850358): red at the public-tree test (file-url on the S1b receipt). This merge fixes it.
- CH/QA of mg-forward-752 at 82419c5: rejected on proof 5 (the same CI red). It is re-frozen on top of this merge, with explicit test timeouts (CHQA-D2).
Next three bounded items (in order):
1. mg-forward-752: merge main into the branch, re-freeze, cross-family QA, container self-judge 2 (admitted), land.
2. mg-s1c-os-sandbox (frozen at d8b9197 on PR #90): merge main, re-freeze, then the Linux container run (proof 2) and self-judge, cross-family QA, land. The PM ruling on the proof-6 mutant is in the PM's private slice notes; QA confirms it.
3. mg-s2a-codecs (dispatched at 2ecca15; DEV working): one canonical-JSON encoder and one timestamp module; then S2b–S2f per the S2 plan.
Open owner decisions:
- A package split of the control plane and Worker out of the CLI package (recommended as S9, after S2).
- Slice Zero redesign scope (recommended: option 2, an end-to-end judge-minted fixture run).
- Filing the Node v26 JSON.parse defect upstream, and whether to pin this host's node to 22.
- Submitting the prepared GitHub Support purge request for the cached commit and pull-request ref.
