# Semantic boundary probes — observations are not verdicts

Static language such as “safe by construction,” “wired at the production
composition root,” or “task-specific routing” identifies a **candidate
contract**. So do contradictory authority projections, missing execution
identity, uncovered executable source, ambiguous identifiers, and long-lived
state with no visible lifecycle bound. Discovery establishes an obligation to
adjudicate. It proves neither correctness nor a product defect.

The governing trust split is non-negotiable:

1. The repository may supply source and propose cases. It cannot define the
   complete census, authorize its own judge, or grade itself.
2. Mister Clean owns RepositoryObject capture, candidate discovery, plan
   generation, compiled direct checks, supervised observation capture, and
   verdict reduction.
3. A runner supplies raw events and output only. Runner-controlled `result`,
   `verdict`, `passed_cases`, `failed_cases`, or `disposition` fields are
   rejected.
4. Arbitrary runtime semantics require an independently signed attestation.
   The public key, actor authority, role, validity window, and independence
   policy must come from a trust policy outside the audited repository.
5. A signature proves key possession and byte binding. Mister Clean separately
   proves independence, policy authority, evidence integrity, case completeness,
   subject identity, and nonce freshness.

This is the semantic equivalent of “first, do no harm”: a convenient green
runner receipt can never turn unverified behavior into paid debt.

## Candidate classes

Sixteen candidate kinds form one operational-truth graph. The original eight
cover identity, authority, projection, wiring, behavior, state, executable
coverage, and namespaces:

- `construction_boundary`: adversarially cross each claimed construction choke
  point;
- `composition_root_reachability`: prove the production root actually wires the
  mechanism;
- `behavioral_dimension`: prove declared modes, task classes, routes, or
  fallbacks produce their intended different outcomes;
- `authoritative_projection`: derive current status from structured authority;
- `bounded_state_lifecycle`: prove explicit bounds and enforcement for
  long-lived state;
- `executable_surface_coverage`: prove every production source surface is
  reachable from a non-vacuous canonical quality gate;
- `execution_identity_coverage`: require the externally verifiable
  model+harness+reasoning+provider runtime tuple before current/future DEV or QA
  execution; and
- `identifier_namespace`: reject ambiguous aliases and duplicate canonical
  identifiers across authority namespaces.

The observer-derived systemic layer closes eight additional seams:

- `gate_semantic_bite`: prove a gate rejects one defect-relevant mutation for
  the expected reason and accepts one benign twin;
- `historical_evidence_portability`: deny current terminal credit when its
  cited evidence cannot survive fresh-capsule retrieval from durable custody;
- `acceptance_effect_liveness`: match proof kind to effect boundary, so static
  shape checks cannot prove live playback, delivery, authentication, or deploy;
- `failure_domain_independence`: bind claimed fallback resilience to provider,
  gateway, account, credential, region, and runtime failure domains;
- `representation_equivalence`: bind handwritten twins/mirrors to one canonical
  direction or a shared invariant corpus;
- `supersession_lineage`: require referentially intact, temporally ordered,
  acyclic authority succession with one current head;
- `instruction_polarity`: type executable-looking examples as allowed,
  forbidden, historical, or fixture before instruction assembly; and
- `environment_semantics`: prove shell/tool/locale/glob/input behavior and a
  terminal sentinel in the oldest supported environment.

Identity, authority, source coverage, state, and namespaces use Mister
Clean-owned direct checkers only where their inputs and comparison are
mechanically representable. Construction, composition, and behavioral routing
require runtime observations plus independent judgment. A heuristic discovery
that lacks structured authority remains `verification_debt`; it is not upgraded
to a confirmed defect merely because the heuristic fired.

## Protocol v2: four distinct authorities

### 1. Mister Clean-generated plan

`mister-clean.semantic-plan` schema 2.0 binds:

- the tracked-plus-nonignored RepositoryObject SHA-256;
- complete candidate-set SHA-256;
- run ID, observed time, and single-use challenge nonce;
- every source reference and the SHA-256 of its bytes;
- a contract digest and v2 candidate ID;
- a compiled direct-checker identity, or a complete runtime case plan; and
- the digest of the entire canonical plan.

Changing a referenced byte changes the contract digest, candidate ID, and plan
digest even if the legacy candidate label remains stable. Mister Clean
regenerates the plan from the live census during verification; a record that
merely claims `producer.actor_id: mister-clean` has no authority.

Case proposals use this deliberately untrusted input shape:

```json
{
  "record_type": "mister-clean.semantic-case-proposals",
  "schema_version": "1.0",
  "cases": {
    "<legacy-candidate-id>": [
      {
        "case_id": "negative-control",
        "intent": "describe the behavior being exercised",
        "required_observations": ["decision"]
      }
    ]
  }
}
```

The generated plan must be written outside the audited repository. Repository
case proposals remain proposals; the independent attester must judge case-plan
adequacy.

### 2. Mister Clean-supervised raw observations

`mister-clean.semantic-observations` schema 2.0 binds the plan, candidate,
subject, pre/post RepositoryObject, runner executable/argv digests, case times,
exit status, output evidence, and named observations. Evidence references must
resolve inside one supplied evidence root and match their SHA-256 digests. The
complete evidence-root digest is independently bound by the attestation.

The observation record contains no pass/fail vocabulary. Process status is an
observation, not a semantic verdict. A nonzero process may reproduce a product
defect or merely indicate a broken probe; adjudication decides which.

### 3. External independent attestation

`mister-clean.semantic-attestation` schema 2.0 binds the exact RepositoryObject,
plan, candidate, observations, evidence root, run, and challenge nonce. Each
planned case receives `supports`, `refutes`, or `inconclusive`; the attester also
judges overall case-plan adequacy and records limitations. The unsigned record
is canonicalized and signed with Ed25519.

The trust policy is external to the subject and names authorized key IDs,
actors, roles, public keys, and validity windows. The attester cannot be the
runner or Mister Clean supervisor. Replayed nonces, invalid signatures, stale
keys, policy-byte drift, missing cases, tree drift, or evidence mismatch produce
`verification_debt`.

### 4. Mister Clean verdict reduction

Only Mister Clean derives one of:

- `deterministically_satisfied`;
- `attested_satisfied`;
- `confirmed_failure`;
- `verification_debt`; or
- `operate_time_pending`.

Release readiness accepts only the first two. `refutes` yields a confirmed
failure. Inadequate/inconclusive scope or judgment remains operate-time pending.
Every binding, signature, evidence, or completeness error remains verification
debt.

## Commands

Discover the current candidate census:

```bash
mister-clean audit semantic . --json
```

Generate a plan outside the repository:

```bash
mister-clean semantic plan . \
  --case-proposals <case-proposals.json> \
  --run-id <run-id> \
  --nonce <single-use-random-nonce> \
  --output <external-evidence-dir>/semantic-plan.json \
  --json
```

Verify a direct candidate with the compiled Mister Clean checker:

```bash
mister-clean semantic verify . \
  --plan <semantic-plan.json> \
  --candidate <v2-candidate-id> \
  --json
```

Verify a runtime candidate:

```bash
mister-clean semantic verify . \
  --plan <semantic-plan.json> \
  --candidate <v2-candidate-id> \
  --observations <semantic-observations.json> \
  --attestation <semantic-attestation.json> \
  --trust-policy <external-trust-policy.json> \
  --evidence-root <external-evidence-root> \
  --json
```

## Legacy schema 1.1 migration

Legacy `mister-clean.semantic-probes` manifests and 1.0 runner receipts remain
readable as historical evidence. Their `pass`, `passed_cases`, and
`not_applicable` assertions never clear an obligation. A legacy FAIL may still
establish a defect because accepting failure cannot manufacture green state.
Every legacy pass or non-operative claim emits
`semantic_probe_independent_attestation_required` until recaptured under v2.

Never combine partial v1 and v2 records to satisfy one candidate. Preserve old
bytes and map their IDs through `legacy_candidate_ids`, then derive a fresh v2
plan from the current RepositoryObject.
