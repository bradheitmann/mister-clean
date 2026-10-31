# Routing-Policy Evaluation and Counterfactuals: A Source-Led Report

**Prepared for:** Mister Clean — control-plane routing/staffing policy evaluation (task F6)
**Author seat:** RSCH5 (BigPickle), researcher
**Research date:** 2026-10-09
**Method:** Read-only primary-source review with live browsing. Everything in this report was read or
re-fetched on 2026-10-09; each source is annotated with its submission/revision dates and a dated link.
Where a claim is my own inference or recommendation it is marked **[Interpretation]** or
**[Recommendation]**; where a number comes from a source it is marked **[Fact]**. Nothing here was verified
by running any engine, benchmark, provider API, or model; no inference or provider connection was made and
no Mister Clean code or data was changed. **Article-level licenses were NOT captured for this follow-up's
sources** (an explicit decision; article licenses are distinct from code/data licenses and neither was
cleared for reuse).

---

## 1. Scope and method

This report answers one question for Mister Clean's control plane: *how should routing/staffing policies be
evaluated, fairly and with counterfactual evidence, before they are allowed to control production traffic?*

The intended consumer is the routing/control-plane side of the Agent Eval Lab work (`project/planning/`);
the report stays at the research layer. It does not install anything, does not touch `jev-rlcd` beyond
referring to it by name, does not propose a live test harness against real providers, and does not set
production gates.

**What this report is not.** It is not a vendor comparison, not a recommendation to route real user traffic
through any candidate policy on day one, not a license clearance, and not a claim that any published router
benchmark qualifies for production use here.

**Disclosure of what was actually fetched (and what failed).** Live browsing was used. Fetched and read in
full or in part this session and during the prior research session:

- Prior session (dates verified from abstract/landing pages on access): Dudík, Langford & Li (2011);
  slate off-policy evaluation (2016); an empirical study of offline policy evaluation methods (2019,
  Voloshin et al.); Gilotte et al. offline A/B testing (2018); RouteLLM (2024, v4 2025); RouterBench
  (2024); FrugalGPT (2023); Dekoninck et al. unified routing + cascading (2024, v3 2025); Žliobaitė concept
  drift (2010); Liu et al. infinite-horizon off-policy evaluation (2018); Google SRE Book Ch. 21 Handling
  Overload; AWS Builder Library on timeouts/retries/backoff with jitter; SRE Workbook Ch. 16 Canarying
  Releases; Gateway API Inference Extension (EPP) docs; Argo Rollouts Concepts docs.
- This session: Argo Rollouts **Analysis & Progressive Delivery** docs
  (`argo-rollouts.readthedocs.io/en/stable/features/analysis/`); SimPy overview docs
  (`simpy.readthedocs.io/en/latest/`); web-search sweeps for CUPED and ADWIN (verified against the ACM DL /
  SIAM/SDM landing pages, i.e. search-excerpt level, not full-text fetched pages).
- **Failed / wrong fetches (disclosed):** an initial assumption that the CUPED paper is on arXiv was
  wrong — arXiv:1305.1401 is a hep-th physics paper, **not** the CUPED paper; the correct CUPED citation is
  a WSDM 2013 paper (see §12, §13). Also carried from the prior session: the Google Gemini function-calling
  docs fetch failed with a transport error and was never obtained (not needed for this report).

CUSUM (Page 1954), *The Tail at Scale* (Dean & Barroso 2013), Mitzenmacher's *Power of Two Choices*, and
the population stability index (PSI) are cited at **citation level as known-but-not-re-read**: their exact
formulations are used here only as names/mechanisms, and no quantitative claim is made from them directly.

**Terminology.** A *policy* is a decision rule mapping a request context (model, task, latency/quality
budget, current utilization) to a routing/staffing decision (which provider/model seat, and at what concurrency).
An *evaluation* compares one policy to a baseline under controlled or quasi-controlled conditions.

---

## 2. Decision-oriented summary

- **There is no "one right answer" evidence method; the ladder is ordered by causal strength and control.**
  Trace replay is cheap and zero-risk but inherits the behavior of the old policy (selection bias). DES is
  the only method that can vary *the system's own* capacity and contention directly, but it must be
  calibrated or it is fiction. OPE (offline policy evaluation) is the mathematically principled way to
  re-score traces under a *different* policy, but it is brittle exactly where routing lives: on
  **support/overlap** and on **horizon**. Paired workloads / CUPED are the working, variance-reduced way to
  compare two whole systems in production. Shadow recommendations give observation without consequence but
  cannot observe outcomes the production policy never reached. Staged adoption (canary) is the final
  arbiter and is itself a policy, not a lab.
- **The strongest, most actionable result in the OPE literature is the design constraint, not a number:**
  offline evaluation of a new policy against logged data is only meaningful when the logging policy
  *explored* — when it recorded propensities for the decisions it actually took at decision time.
  **[Interpretation]** This makes **propensity logging a data-field requirement**, not an analysis nicety:
  `π_log(a|x)` recorded at routing time is the single thing that makes trace replay, IPS/DR estimators, and
  shadow analysis shareable across policies.
- **`pass^k`-style consistency metrics do not transfer to a shared-inference fleet.** Consistency
  measurements taken on independent single-model runs say nothing about routing policies, because fleet
  runs **compete for the same capacity** and contention correlates outcomes across runs. **[Interpretation]**
  This is the single most important correction for the routing work, which inherits an evaluation culture
  designed for isolated trials.
- **Benchmark/router scores (RouteLLM, RouterBench) are time-bound strata, not production qualification.**
  They are useful as *what the field measures* and as *hypothesis sources*, not as an acceptance gate.
- **Forecast vs measured must be separated for every family.** A router benchmark "forecast" (e.g. {
  cost, quality } from a scored corpus) is not the same thing as a measured, causally attributed change in
  production call outcomes.
- **Recommended minimal evidence stack for a local-first control plane** (all in-scope and cheap):
  captured real traces with propensity fields → synthetic, calibrated DES (Rust-compatible, not Python
  SimPy) → offline re-scoring (IPS/SNIPS/DR) of captured traces under candidate policies → paired,
  pre-registered workload comparisons using a CUPED-style covariate → shadow execution → staged adoption
  (Argo Rollouts pattern) with a drift tripwire (ADWIN-style). Each rung answers the question the rung
  before it cannot.

---

## 3. Corrections of prior claims relevant to routing

These correct statements the project's planning layer should treat as invalid for routing work:

1. **Independent-trial consistency ≠ routing correctness.** `pass^k`-style consistency, measured by
   repeating an isolated task on a single model, does not transfer to a policy claim about a fleet where
   concurrent runs contend for shared capacity. **[Interpretation]** Routing decisions change *which* runs
   contend, so a routing policy must be evaluated under a contention model, not by single-run repeats.
2. **Benchmark grades are not qualification.** A router or model benchmark score (RouteLLM, RouterBench,
   BFCL-style tool scores) is a bounded measurement of a specific artifact at a point in time. It does not
   qualify a route for production. (Carried from the structured-output survey; restated here because routing
   work is a fresh temptation to use router-benchmark tables as gates.)
3. **Provider results are time-bound strata.** Prices, quality, and latency move; FrugalGPT's 2023
   "two-orders-of-magnitude" pricing heterogeneity is a description of a market at a date, not a law — it
   must not be re-cited as a current constant. **[Fact: paper is 2023-05-09; the number is time-bound.]**
4. **The route is part of the observed identity of an outcome, not decoration.** The serving/decoding
   configuration was already bound to identity in the Lab model; the routing decision (which provider seat,
   which concurrency lane) must be extended as part of identity, because an outcome under route A is not
   evidence about route B. **[Interpretation]**
5. **`1804.01523` was the wrong arXiv ID for the horizon/off-policy paper.** The correct ID is
   **arXiv:1810.12429** (Liu et al., infinite-horizon off-policy evaluation); 1804.01523 is *Stochastic
   Adversarial Video Prediction* and must not be cited. (Correction of a mid-research mis-assignment in the
   prior session.)
6. **"CUPED paper is on arXiv" is wrong.** It is a WSDM 2013 paper, not on arXiv (see §12, §13).
7. **There is no universal safe-utilization threshold.** No fetched source supplies one; thresholds are
   system-specific. **[Interpretation]** Any report that suggests 70% or any other fixed number is safe is
   not supported by the sources here.
8. **Forecast ≠ measurement was not always kept separate in prior routing-planning discussions.**
   All forecast numbers in this report are explicitly labeled as such.

---

## 4. The decision problem

The control plane must choose, per request (or per burst), where a task runs. Four policy families are in
scope:

- **FIXED_STAFFING** — a static assignment (e.g., "all local", "all cheapest-qualified", "all curated
  route X"). Maximal determinism and auditability; no adaptation.
- **CHEAPEST_QUALIFIED** — pick the cheapest candidate that satisfies a stated quality/latency budget,
  where "qualified" comes from a scored corpus or a prior evaluation. Adapts to per-request context but not
  to fleet state.
- **CAPACITY_AWARE** — a routing family that reads load: queue depth, utilization, concurrency, in-flight
  retries. The Gateway API Inference Extension EPP ("load-based" traffic shaping) and the SRE client-side
  throttling pattern are the reference mechanisms **[Fact: gateway-api-inference-extension docs; SRE
  Ch.21]**.
- **ADAPTIVE** — changes staffing over time in response to drift signals (ADWIN/CUSUM-family windows or
  quality telemetry tripwires) and/or learned routing (RouteLLM-style thresholds trained on preferences).
  Highest upside and highest evaluation burden.

These families are **not mutually exclusive** (cheapest-qualified can be capacity-aware; capacity-aware can
be adaptive). They are separated here because each needs a different evidence method, and conflating them is
how weak evidence sneaks in: a FIXED policy can be evaluated by replay; an ADAPTIVE policy cannot be
declared done by the replay that evaluated its frozen snapshot.

**[Interpretation] Forecast vs measured, made concrete.** The four families are generally compared on
*forecast* grounds first (scored corpora: "cheapest-qualified would have been 30% cheaper at equal quality").
The report's central demand is that a forecast is only a hypothesis until (a) re-scored offline with
support/overlap accounted for, then (b) measured on paired live workloads, then (c) adopted under a staged,
stop-condition roll-out.

---

## 5. Evidence ladder

Ordered from weakest/cheapest to strongest/most expensive control. Each rung answers what the prior rung
cannot.

### Rung 0 — Trace replay (deterministic re-enactment)

Replay captured request+outcome traces through a candidate policy as a pure function. **What it is good
for:** exact, zero-risk reproduction; testing the policy *logic* (is it even well-formed?); regression
testing routing code. **What it cannot do:** tell you what would have happened under the new policy at the
moments the old policy never reached — the trace is a sample from the *logging* policy, so a different
policy's decisions are **off-policy** and replay of the raw trace is biased. Replay is a correctness tool
first, an evaluation tool only when combined with importance weights (Rung 2). **[Interpretation]**

### Rung 1 — Discrete-event simulation (DES)

A model of the system (arrival process, per-candidate service-time distributions, limited-capacity seats,
queueing, retry behavior) used to run counterfactual worlds: `what if policy X under this arrival/load
regime`. **Reference mechanism:** SimPy (Python, process-based; shared `Resource`s model limited-capacity
congestion points) **[Fact: simpy.readthedocs.io overview]** — but SimPy itself is **Python**; for a
Rust-first project this is a **conceptual reference only**, and a Rust-compatible DES would be a separate
implementation, not a port. **[Interpretation]** DES is the only rung that can vary *the system's own*
capacity and contention directly (capacity-aware and adaptive families care about exactly this). **Beware
calibration:** an uncalibrated DES yields confident, wrong numbers; service-time distributions must be
fit to real trace per-candidate and the model must reproduce the trace's aggregate behavior before any
counterfactual is trusted.

### Rung 2 — Offline policy evaluation (OPE): importance sampling and its refinements

Re-score captured traces under a candidate policy using logged propensities. See §6 for the estimators and
their exact failure conditions. **[Fact: Dudík et al. 2011 for DR; empirical study 2019 for brittleness.**
[Interpretation]** This is the mathematically right tool for "would OTHER routing have been better on the
tickets we actually saw" **given explored logging**. The non-negotiable precondition is Chapter 10's
prospective `π_log` recording.

### Rung 3 — Paired live workloads (with CUPED-style variance reduction)

Two whole systems (baseline vs candidate policy) split live traffic (e.g., hash/UUID-stable bucketing)
across the same arrival stream, and the *difference* in a pre-registered metric is measured. **Reference
mechanism:** CUPED uses a covariate measured in a **pre-experiment period** to shrink variance of the
experiment metric, achieving ~50% variance reduction in Bing's experimentation system **[Fact: Deng, Xu,
Kohavi & Walker, WSDM 2013]**. Paired comparisons are the workhorse for comparing FIXED and
CHEAPEST_QUALIFIED systems because they measure the *whole bundle* including contention.
**[Interpretation]**

### Rung 4 — Shadow recommendations

The candidate policy observes traffic and logs a recommendation but does not affect outcomes. **Good:**
no harm, cheap, exercises the real arrival stream. **Cannot:** observe the counterfactual outcome — the
production policy selected the actual provider, so the shadow recommendation's "would it have worked?"
is only answerable when the *same* request is independently logged with outcome under both (possible for
deterministic/gradeable tasks, not for real users). Shadow is an observation instrument, not a verdict.
**[Interpretation]**

### Rung 5 — Staged adoption (canary) with an analysis gate

Adopt the candidate on a small, enumerated slice of traffic, evaluate the slice against a paired control,
and promote only on the pre-registered condition. **Reference mechanisms:** Argo Rollouts analysis — a
Rollout updates canary/blueGreen progress only via AnalysisRuns (metrics are handled by the Analysis
platform; the core controller does **not** accept new metric integrations directly — it has a **plugin
architecture**) **[Fact: argo-rollouts.readthedocs.io/en/stable/features/analysis/]**; SRE Workbook Ch. 16
canarying releases; AWS Builder Library on managed rollouts of dependencies/retries. **[Interpretation]**
For an ADAPTIVE policy, staged adoption is not a one-time event; the drift tripwire *is* the ongoing canary.

### Rung 6 — Drift detection (continuous)

After adoption, ADWIN- or CUSUM-style adaptive windows continuously re-assess whether recent batches still
match the acceptance-time distribution. **[Fact: ADWIN = Bifet & Gavaldà, SDM 2007; guarantees on
false-positive/false-negative rates, adaptive window size, efficient ADWIN2 variant.]** CUSUM cited at
reference level (Page 1954, not re-read).

---

## 6. Formulas and assumptions

All estimators below are stated for the canonical form. Assume logged data `(x_i, a_i, r_i)` where `x` is
the context, `a` the routed action, `r` the observed scalar reward/outcome, and `π_log(a|x)` the recorded
logging-propensity. Candidate policy `π(a|x)`. Importance weight `w_i = π(a_i|x_i) / π_log(a_i|x_i)`.

1. **IPS (inverse propensity scoring).**
   `V̂_IPS(π) = (1/n) Σ_i w_i r_i`.
   Unbiased when (a) full support: `π(a|x) > 0` whenever `π_log(a|x) > 0` (the candidate proposes only
   actions the logger sometimes took), and (b) `π_log` is the true logging policy **[Fact: Dudík et al.
   2011; standard]**.
   **Assumption to state:** overlap. Outside the support of `π_log`, IPS is undefined; a candidate policy
   with a "better" action that never appears in the logs is **invisible to IPS**.

2. **SNIPS (self-normalized IPS).**
   `V̂_SNIPS(π) = (Σ_i w_i r_i) / (Σ_i w_i)`.
   Lower variance than IPS, biased; breaks normalization identity. Gilotte et al. (offline A/B, 2018) report
   **capped / normalized-IS estimators have poor bias-variance trade-offs** in their recommendation setting
   **[Fact: arXiv:1801.07030]**. This is the practical warning: weight clipping to fight variance buys bias.

3. **Doubly robust (DR).**
   `V̂_DR(π) = (1/n) Σ_i [ r̂(x_i, a_i) + w_i (r_i − r̂(x_i, a_i)) ] ` over the actions, with `r̂` a fitted
   value model. **Consistency condition:** the estimator is consistent if *either* the propensity model is
   correct *or* the value model is correct; when both are wrong it can be strictly worse than IPS **[Fact:
   Dudík et al., arXiv:1103.4601 — DR consistency requires `E[w (r − r̂)] → 0` in appropriate norm]**.
   In practice: DR reduces variance only when the residual `r − r̂` is small, so a good value model is a
   prerequisite **[Interpretation]**.

4. **Support / overlap.** Every estimator above silently assumes the candidate policy is "covered". The
   failure mode for routing: cheapest-qualified's *chosen* providers may be rare in the logs, so its
   variance explodes exactly where it claims the win. **[Interpretation]**

5. **Horizon effect.** Off-policy error grows with the decision horizon; the empirical OPE study reports
   OPE error increasing with horizon across methods **[Fact: arXiv:1911.06854, v3 2021]**; infinite-horizon
   treatment: Liu et al. **[Fact: arXiv:1810.12429]**. **[Interpretation]** For routing this means: evaluate
   per-single-round decisions (one call) with more confidence than multi-turn episode-level "routes" (a
   chain of dependent calls). Multi-turn policies need explicitly horizon-corrected estimators or paired
   live trials.

6. **CUPED (variance reduction for paired trials).** For metric `Y` and pre-experiment covariate `Z`,
   `Y' = Y − θ (Z − E[Z])`, `θ = Cov(Y, Z)/Var(Z)`; the adjusted metric has variance reduced by the
   correlation `1 − ρ²` in the ideal case. Bing's experimentation system reported **~50% variance
   reduction** using a pre-experiment-period covariate **[Fact: WSDM 2013]**. **[Interpretation]** For
   routing this is *the* practical tool: compare two policies on the same arrival stream using a
   pre-switch covariate (e.g., pre-experiment per-candidate latency/quality stats) to shrink the noise that
   real traffic variance otherwise dominates.

7. **Paired-difference variance.** When policies A and B see the *same* (paired) request stream,
   `Var(A−B) = Var(A) + Var(B) − 2 Cov(A, B)`; shared-arrival pairing makes `Cov` positive → the difference
   shrinks. This is why same-stream split experiments are far more sensitive than compare-two-periods.
   **[Interpretation; standard identity.]**

8. **Retry amplification (geometric factor).** If a single routed attempt independently succeeds with
   probability `p` (failure `q = 1−p`), then `P(completion within m attempts) = 1 − q^m`, and the number of
   attempts to reach tolerance `ε` is `m = ⌈ log ε / log q ⌉`. **[Interpretation; standard probability, not
   sourced to any paper.]** For routing this couples policy to load: a policy that slightly lowers `p`
   (e.g., routes to a cheaper, weaker model) multiplies *total in-flight attempts* under the retry budget —
   which can recreate the very contention the policy was meant to avoid. Retry budgets must be modeled in
   DES *and* re-measured in paired trials, never taken from the `p` of isolated runs. **[Carried from AWS
   Builder Library + SRE Ch.21 context; the amplification formula itself is the generic geometric model.]**

9. **Assumptions you must write down.** For every estimate: (i) the logging policy and its propensities;
   (ii) the support/overlap statement; (iii) i.i.d.-per-decision or horizon-corrected; (iv) the reward
   definition and its scrutability (who/what grades the outcome); (v) stationarity window (what drift
   detection assumes and what breaks it). **[Interpretation — a "fitness for evidence" checklist.]**

---

## 7. Constraints that bound the evaluation

- **Quality/no-harm/independence.** A routing change must not lower task quality (per evaluation
  standard) and must not compromise independent-grading guarantees. Routing changes the *evidence base* for
  grading (the route is part of observed identity), so a routing experiment and a grading experiment cannot
  be treated as independent treatments of the same outcome. **[Interpretation]**
- **Correlated errors.** Fleet models share training lineage and failure modes. Independently-sampled
  per-run errors do not stay independent when a correlated degradation hits the shared pool. **[Interpretation]**
  DES should inject correlated-failure scenarios (bursty common-cause outages), not just i.i.d. per-candidate
  noise, or it will understate tail risk.
- **Topology overhead.** Adding a routing/staffing layer costs latency and a failure point. Evaluation
  metrics must include end-to-end overhead (route computation, queue wait), not only candidate quality —
  otherwise "smarter routing" loses real time captured as lower quality. **[Interpretation]**
- **Retry traffic.** §6.8: retry amplification couples policy choice to offered load. A fair evaluation
  models the retry policy as part of the route. **[Interpretation]**
- **Switching costs.** Re-staffing a seat (unload a model, load another, warm cache) is expensive and
  itself disruptive; an ADAPTIVE policy that flips on small drift signals can burn more in switching than it
  saves. Evaluation must count switching events and their cost, not just steady-state metric deltas.
  **[Interpretation]**

---

## 8. Forecast vs measured — the discipline

For each family, report both, explicitly labeled:

| Layer | FIXED_STAFFING | CHEAPEST_QUALIFIED | CAPACITY_AWARE | ADAPTIVE |
|---|---|---|---|---|
| **What "forecast" means here** | Curated table of per-candidate scores on a corpus | Cost-to-budget model over a scored corpus | Utilization/queue model (EPP "load" or SRE throttling `K`) | Threshold learned from scored corpus (RouteLLM-style) or drift policy spec |
| **Forecast evidence** | Benchmark strata (time-bound) | Router benchmarks (RouteLLM, RouterBench — v1/v4 dates) | DES under modeled load | RouteLLM trained on preference pairs **[Fact: 2024]** |
| **What "measured" means here** | Paired live split vs incumbent on pre-registered metric | Paired live split on the *decisions actually taken* | Paired live split under real load + observed contention | Paired live split **plus** drift-tripwire re-checks over time |
| **Counterfactual method** | Trace replay + IPS (needs explored logs) | IPS/SNIPS/DR with support/overlap stated | DES (calibrated) + staged adoption | Snapshot re-score (frozen) + ongoing ADWIN/CUSUM on live metric |
| **Dominant bias if you skip measurement** | Stale strata treated as current | Selection bias on "would have saved X%" | Uncalibrated queue model → false confidence | Overfitting the training corpus; silent drift post-adoption |

**[Interpretation]** The one discipline that rules the table: **a forecast is a hypothesis until it is a
measured difference on the same arrival stream.** Every unmeasured claim is a hypothesis; every measured
claim cites its paired stream and its window.

---

## 9. Four-policy comparison on identical synthetic workloads

The fair comparison: **the same synthetic arrival stream** (same request mix, same timing) is fed to all
four families, and each family is scored on the same four metrics. All numbers in the worked hypothetical
below are **abstract units**, chosen to illustrate method, not to predict any provider.

**Worked hypothetical (abstract units).**
- Arrival stream: 10,000 requests; 60% easy (quality budget low), 30% medium, 10% hard.
- Candidate pool: A (fast/cheap, quality `.70` on easy), B (mid, quality `.90`), C (strong/expensive,
  quality `.98`), each with per-request service time `s_A < s_B < s_C` and a shared capacity of 3 seats.
  Per-seat contention: when a seat's queue exceeds its buffer, the attempt fails, triggering the retry
  budget (max 2 retries, geometric model §6.8).
- Reward: `quality · completion − 0.1 · cost − 0.2 · extra_attempts − 0.5 · timeout`.

| Metric | FIXED_STAFFING (all→B) | CHEAPEST_QUALIFIED | CAPACITY_AWARE | ADAPTIVE (B↔C with drift tripwire) |
|---|---|---|---|---|
| Reward (Σ) | 1,000 | 1,180 | 1,240 | 1,250 |
| Quality (mean) | .905 | .881 | .902 | .905 |
| Cost (Σ) | 200 | 148 | 163 | 166 |
| Failed/timeout (count) | 35 | 61 | 22 | 24 |

What the hypothetical is *for*, not what it claims:
- CHEAPEST_QUALIFIED wins on raw cost but produces the most failures — the comparison surfaces that its
  "saving" is load we passed into the retry budget. **[Interpretation]** This is the classic forecast-vs-
  measured trap made visible in one table.
- CAPACITY_AWARE and ADAPTIVE reduce failures by steering away from congested seats, at a small cost
  increase. Whether that survives real traffic depends on the DES calibration (Rung 1) and paired trial
  (Rung 3), not on the table.
- The table is only meaningful because **every family ran the same stream**. Replacing the stream per
  family invalidates the comparison. **[Interpretation]**

**[Recommendation]** Reproduce this exact pattern (one stream, four families, four metrics incl.
failures-under-retry) as the standard report format for any routing comparison; the interesting result of a
routing evaluation is almost always the *interaction* (quality vs cost vs failures), not the single best
number.

---

## 10. Datasets, policy snapshots, evidence records, acceptance tests

### Datasets (each with a stated purpose and a stated support relation to the others)
- **D_REAL_CAPTURED:** real routed requests with `x, a, r`, **plus `π_log(a|x)` and timestamp**, recorded
  retroactively from now on (see the logging requirement below).
- **D_SYNTH_STREAM:** the single shared arrival stream for cross-family comparison (the §9 stream), in a
  content-addressed form so variants are tracked.
- **D_SYNTH_CORRUPTED:** common-cause correlated-failure injections (all-seats degradation bursts) to test
  tail behavior in DES.
- **D_PAIR:** paired live-trial records (same request hashed to a stable bucket; both policies recorded with
  outcome under the assigned policy).

### Policy snapshots
A policy is versioned as: decision rule + parameters + the corpus/hyperparameters it was trained on (for
learned thresholds) + the dataset commits it was scored against + a hash of the code that executes it. A
snapshot is **immutable**. An ADAPTIVE policy's *snapshot* (the frozen rule evaluated by replay) and its
*live behavior* (drift-triggered updates) are two different objects that must be recorded separately.
**[Interpretation]**

### Evidence records (fields; per the lab's record discipline)
- request id, context, observed action, `π_log`, timestamp
- candidate policy snapshot id + decision output
- outcome + who/what graded it + grade version
- retry events (so amplification can be reconstructed)
- seat/load state at decision time (for capacity-aware claims)
- which rung produced this record (replay / DES / OPE / paired / shadow / canary / drift)

### Acceptance tests — without universal thresholds
There is **no universal safe-utilization or quality threshold** in the sources (§3.7). Acceptance tests
must therefore be **relational and pre-registered**:
- "Candidate is not worse than incumbent on {pre-registered metric} at a pre-registered significance and
  window on a paired stream" (paired trial, CUPED-adjusted).
- "Candidate forecast (offline re-score) is *in the same direction* as the measured paired difference; if
  they disagree, the offline estimate is held suspect, not the live measurement." **[Interpretation]**
- "DES reproduces the captured trace's aggregate behavior within pre-registered error bounds BEFORE any
  counterfactual is reported" (calibration gate).
- "No drift tripwire fired in the adoption window" or "tripwire fired and rollback completed within bounded
  time" (for ADAPTIVE).

**[Interpretation]** Relational, pre-registered, stream-paired acceptance beats any fixed constant: fixed
constants are how unmeasured "safe" claims sneak back in.

---

## 11. Synthetic validation tests

Concrete, runnable-when-ready tests (research-level definitions; no repo changes made here):

1. **Overlap stress test.** Take D_REAL_CAPTURED, compute the candidate policy's decision distribution,
   report the share of candidate decisions with zero logged support, and refuse the IPS/DR estimate when the
   share exceeds a pre-registered bound. **[Validates Rung 2 assumptions, not a system.]**
2. **IPS-vs-DR consistency test.** On the same traces, IPS, SNIPS, DR (with a deliberately weak value model)
   must produce estimates that agree within pre-registered tolerance on a held-out slice; disagreement is a
   signal that the assumptions (§6.9) are violated. **[Interpretation]**
3. **DES calibration test.** Fit per-candidate service times to the trace; require the DES to reproduce
   trace-level aggregate (mean latency, failure share, seat utilization series) within error bounds before
   the counterfactual is trusted.
4. **Correlated-outage test.** Inject a correlated degradation burst and require CAPACITY_AWARE/ADAPTIVE to
   show failure containment vs FIXED (which by construction cannot). [Interpretation.]
5. **Retry-coupled test.** Evaluate the same policies with retry budget 0 vs 2 vs 5; require the ordering of
   families to be *reported per budget*, because §6.8 says amplification changes with the budget.
6. **CUPED sanity test on simulated pairs.** Generate paired streams with a known effect of size
   `δ`; confirm the CUPED-adjusted estimator recovers `δ` with lower variance than the unadjusted
   difference on the same data. [Method test, not a system test.]
7. **Drift tripwire test.** Feed a drifting stream (step and ramp change types) to ADWIN/CUSUM; require
   detection within the traffic volume the tripwire is deployed with. **[Fact basis: ADWIN SDM 2007 bounds;
   CUSUM reference-level.]**
8. **Forecast-vs-measured reconciliation test.** For each family, record forecast and measured values on the
   same metric; the report must explain any sign flip. **[Interpretation — this is the discipline test.]**

---

## 12. Strongest contrary evidence (steelman)

The honest skeptic's case, which this report does not wave away:

1. **OPE is brittle exactly where routing lives.** The empirical OPE study finds offline policy evaluation
   methods degrade (error grows with horizon; model-free methods especially). Gilotte et al. find
   capped/normalized IS have poor bias-variance. **[Fact: arXiv:1911.06854; arXiv:1801.07030.]** Routing
   evaluates decisions whose consequences are scored by noisy graders, under a logging policy that will
   *not* satisfy full support (production won't purposefully route to losers to feed an OPE). The honest
   conclusion: **OPE here is a sanity-check and a hypothesis-rank sorter, not a decision maker.**
2. **Shadow outcomes are epistemically hollow.** Without pair-logging, a shadow recommendation's
   "better" verdict is unobservable; the same request stream is only *observed* under the production policy.
   **[Interpretation]**
3. **DES calibration is where simulators die.** A DES that reproduces aggregates can still mis-handle the
   tail. The sources give no calibration procedure; reproducing the trace is a necessary, not sufficient,
   condition. **[Interpretation]**
4. **Synthetic streams are not real streams.** The §9 stream is abstract; real arrival patterns carry
   session structure, correlated scripts, and human pacing that no synthetic stream encodes. Synthetic
   results are hypotheses about real load, not measurements of it.
5. **ADAPTIVE is the hardest to bound.** Its evaluation object moves; a frozen snapshot can pass replay
   while live updates drift; the drift tripwire itself must be validated (§11.7) or it is theater.
   **[Interpretation]**
6. **The log-propensity requirement is a production cost.** Recording `π_log` and *exploring* enough to make
   it supported means deliberately sending some traffic to suboptimal routes. The counterargument is
   Clarke's-law-flavored: the cost of a perpetual, fat-tailed uncertainty about routing policy is larger
   than the cost of maintained exploration. **[Interpretation]** This is a real trade, and the report
   presents it as an owner decision, not a settled recommendation.

---

## 13. Unknowns that stay unknown

- **No current prices/behavior for any provider or model.** Time-bound strata only; FrugalGPT's
  two-orders-of-magnitude number (2023) is historical, not current. **[Fact-date boundary.]**
- **No universal safe-utilization threshold exists in any fetched source.**
- **No calibration of any OPE estimator on Mister Clean's grader reliability.** Grader noise inflates
  `r`, and no estimator here was validated against the lab's specific rubrics.
- **No exposure/contamination proof** for any public router corpus.
- **CUPED's ~50%** is Bing's reported reduction in *their* system — a fact about that system, not a
  portable constant for routing metrics.
- **CUSUM, The Tail at Scale, Power of Two Choices, PSI** were not re-read; only referenced by name
  (mechanism-level, no numbers attributed to them).
- **The Google Gemini docs fetch** failed previously and was never obtained; nothing here depends on it.
- **THREE STATED-NOT-RESOLVED:** (1) whether real production *must* explore for OPE support — is an owner
  decision; (2) the retry-amplification formula's abstract-units availability — the geometric model is
  standard, but per-system `p` values are unknown until measured; (3) whether the log-propensity data-field
  requirement is adopted — a schema decision outside the research layer.

---

## 14. Open questions and evidence gaps

1. **A Rust-compatible DES does not exist-as-validated here.** SimPy is Python; the project would build its
   own. Nothing in this report validates such a build.
2. **Pair-logged multi-policy outcome data is absent today**; paired CUPED analysis (Rung 3) cannot be
   demonstrated until D_PAIR exists.
3. **Drift tripwire thresholds** (ADWIN's `delta`/size, CUSUM's `k/h`) are unvalidated for the lab's
   metric distributions.
4. **Retry-policy × routing-policy interaction** is modeled only by the geometric factor and DES scenarios;
   it is not yet a measured quantity anywhere in scope.
5. **Aggregating evidence across rungs** (forecast vs replay vs OPE vs paired) has no agreed reconciliation
   rule beyond "sign flips must be explained" (§11.8); the lab may want a stronger canonical rule.

---

## 15. Sources

All accessed/re-fetched **2026-10-09**, either in full, as search-verified excerpts, or as prior-session
fetches (dates verified on access). "License" lines below are the **article** license where captured; this
report does **not** capture article licenses for its follow-up sources (stated in the header). Article
licenses ≠ code/data licenses.

1. Dudík, Langford & Li, *Doubly Robust Policy Evaluation and Learning*, arXiv:1103.4601, v1 2011-03-23,
   v2 2011-05-06. https://arxiv.org/abs/1103.4601
2. Gilotte et al., *Offline A/B Testing for Recommender Systems*, arXiv:1801.07030, 2018-01-22.
   https://arxiv.org/abs/1801.07030
3. Voloshin, Le, Jiang, Yue, *Empirical Study of Off-Policy Policy Evaluation for Reinforcement Learning*,
   arXiv:1911.06854, v1 2019-11-15, v3 2021-11-27. https://arxiv.org/abs/1911.06854
4. Liu et al., *Breaking the Curse of Horizon: Infinite-Horizon Off-Policy Estimation*, arXiv:1810.12429,
   2018-10-29. https://arxiv.org/abs/1810.12429 (correct ID; 1804.01523 is a different paper — see §3.5)
5. Swaminathan et al., *Off-Policy Evaluation for Slate Recommendation* (slate/recommendation off-policy),
   arXiv:1605.04812, 2016-05-16, v3 2017-11-06. https://arxiv.org/abs/1605.04812
6. Deng, Xu, Kohavi & Walker, *Improving the Sensitivity of Online Controlled Experiments by Utilizing
   Pre-Experiment Data*, WSDM 2013; ACM DL https://dl.acm.org/doi/epdf/10.1145/2433396.2433413 (Microsoft
   exp-platform hosts the PDF). **Not on arXiv.** ~50% variance reduction reported at Bing on the
   pre-experiment-period covariate. **[Fact]**
7. Bifet & Gavaldà, *Learning from Time-Changing Data with Adaptive Windowing*, SIAM SDM 2007, pp. 443–448,
   DOI 10.1137/1.9781611972771.42. https://epubs.siam.org/doi/10.1137/1.9781611972771.42 — ADWIN; adaptive
   window size; false-positive/false-negative guarantees; ADWIN2 efficient variant. **Not on arXiv.**
8. Ong, Wyrick & Yang, *RouteLLM: Learning to Route LLMs with Preference Data*, arXiv:2406.18665, v1
   2024-06-26, v4 2025-02-23. https://arxiv.org/abs/2406.18665
9. Hu et al., *RouterBench: A Benchmark for Routing and Routing Agents*, arXiv:2403.12031, v1 2024-03-18,
   v2 2024-03-28. https://arxiv.org/abs/2403.12031 (RouterBench; time-bound strata)
10. Ding, Chen & Iyengar, *FrugalGPT: How to Use Large Language Models While Reducing Cost and Improving
    Performance*, arXiv:2305.05176, 2023-05-09. https://arxiv.org/abs/2305.05176 (pricing heterogeneity is a
    2023 claim; time-bound)
11. Dekoninck et al., *A Utility-theoretic approach to evaluate predictive models and routes in cascading
    settings* (unified routing + cascading), arXiv:2410.10347, v1 2024-10-14, v3 2025-05-22.
    https://arxiv.org/abs/2410.10347
12. Žliobaitė, *Learning under Concept Drift: An Overview*, arXiv:1010.4784, 2010-10-22.
    https://arxiv.org/abs/1010.4784 (overview citation; drift taxonomy)
13. Google SRE, *Handling Overload* (Ch. 21, Google SRE Book). https://sre.google/sre-book/handling-overload/
    — client-side throttling & adaptive throttling (client tracks requests vs accepts; caps outgoing traffic
    to a `K` ratio).
14. AWS, *Timeouts, retries, and backoff with jitter*. https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/
15. Google SRE Workbook, *Canarying Releases* (Ch. 16). https://sre.google/workbook/canarying-releases/
16. Gateway API Inference Extension (EPP), https://gateway-api-inference-extension.sigs.k8s.io/ — load-based
    (utilization/queue) traffic shaping reference.
17. Argo Rollouts, *Rollout Concepts* and *Analysis & Progressive Delivery*.
    https://argo-rollouts.readthedocs.io/en/stable/concepts/ and
    https://argo-rollouts.readthedocs.io/en/stable/features/analysis/ — Rollout/AnalysisTemplate/
    ClusterAnalysisTemplate; AnalysisRuns gate or abort canary/blueGreen updates; metric integrations are
    via plugins, not added to core.
18. SimPy overview. https://simpy.readthedocs.io/en/latest/ — process-based DES (Python); generator-function
    processes; shared `Resource`s model limited-capacity congestion. **Python** → conceptual reference only
    for a Rust-first project.
19. Cited at reference level, **not re-read**: Page, *Continuous Inspection Schemes* (CUSUM), Biometrika
    1954; Dean & Barroso, *The Tail at Scale*, CACM 56(2) 2013; Mitzenmacher, *The Power of Two Choices*
    (balanced allocation); PSI (population stability index, actuarial/credit-scoring lineage). No numeric
    claim is made from these here.
20. **Not obtained / wrong guess, disclosed:** arXiv:1305.1401 (hep-th physics paper — initially and
    incorrectly assumed to be CUPED); Google Gemini function-calling docs (transport error, prior session).

---

*Report status: research complete for the sources listed. All sources reviewed read-only; no execution,
inference, routing of real traffic, provider connection, or repository change was performed by the research
seat. This document prescribes no universal thresholds, claims no production readiness, and presents every
quantitative result as time-bound and every forecast as a hypothesis pending measurement.*