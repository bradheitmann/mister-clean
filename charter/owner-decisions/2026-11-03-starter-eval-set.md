# Owner decision 2026-11-03: the release ships a starter eval set

**Decision (owner, 2026-11-03).** Each release ships a small, versioned starter eval set. It is synthetic data derived from the project's real eval data: centroid-indicative records (typical rates, ranges and defect classes per agent tuple), curated and modified so that nothing is traceable to any source project or person. It is a set of opinionated defaults, re-derived each release as more eval data arrives.

**Consumer modes.** A consumer may accept the defaults, ignore them and collect only their own data, or blend both, so that over time their own data and the defaults average together. The mode is recorded in every routing decision's provenance.

**Scope.** Contribution of consumers' telemetry back to the project is not shipped now; the formats leave room for it.

**Consequences for this repository.**
1. The starter set carries provenance `synthetic-derived` with a recorded derivation (source store version, method, date).
2. The export gate removes identifiers (it does not hash them), perturbs or averages values, and runs the public-safety scan with a hashed denylist. The map from real to synthetic records stays in the private data root.
3. The eval harness includes an ablation of routing with and without the defaults.
4. Sequencing: 7.2.0 ships the defect fixes; 7.3.0 ships run receipts and the second pass; the data-product slice (store, importer, starter-set derivation, export) follows, because the starter set is derived from the store.
