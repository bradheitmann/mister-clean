# Structured Output and Tool-Use Evaluation: A Source-Led Survey

**Prepared for:** Mister Clean — Agent Eval Lab / cross-project evaluation standardization (EV-01–EV-06)
**Author seat:** RSCH5 (BigPickle), researcher
**Research date:** 2026-10-09
**Method:** Read-only primary-source review. All arXiv metadata below was read on 2026-10-09; each
source is annotated with its submission date, latest revision date (where shown on the abstract page),
and the **arXiv article license** as returned by the abstract page. Where a claim is my own inference or
recommendation it is marked **[Interpretation]** or **[Recommendation]**. Nothing in this report has been
verified by running any engine, benchmark, provider API, or model; no inference or provider connection was
made and no Mister Clean code or data was changed.

---

## 1. Scope and method

This survey answers one question for Mister Clean's planned **Agent Eval Lab**: *what structured-output and
tool-use evaluation approaches already exist, what do they actually measure, how are they built, and which
parts are worth reusing, adapting, borrowing, or rejecting?*

The intended consumer is EV-01–EV-06 (`project/planning/EVAL-STANDARDIZATION-PLAN.md`) and the Agent Eval
Lab data model (`project/planning/AGENT-EVAL-LAB.md`): role/case/suite/key revisions, preregistered
experiments, attempts, grades, and independent grading. This report stays at the research layer — it does
not design schema or approve implementation.

**Coverage.** Six layers are surveyed: (a) constrained/structured decoding engines, (b) provider
structured-output and tool-call APIs, (c) schema-adherence benchmarks, (d) tool-use/agentic benchmarks,
(e) small-model function calling, and (f) the constraint-versus-quality conflict plus (g) grading,
reliability, and contamination caveats. Each item is labeled by what it actually **is**: benchmark,
dataset, runner, grader, telemetry/evidence, or UI. That label matters because the Lab must not conflate a
dataset with a grader, or operational telemetry with verified quality — a distinction EV-01/EV-03/EV-04
make explicitly.

**Out of scope.** This is not a vendor recommendation, not a license clearance, and not a statement that
any external result qualifies a Mister Clean role. It does not inspect or modify `jev-rlcd` and does not
connect to any provider.

---

## 2. Decision-oriented summary

- **Constrained decoding is a mature, layered technology, not a single tool.** The field has converged on
  grammar/FSM-guided generation (Outlines, LMQL, XGrammar, llguidance, llama.cpp GBNF) and provider-side
  JSON-Schema enforcement. The engines differ mainly in *how* they amortize the cost of checking the whole
  vocabulary against a grammar each step.
- **Format compliance ≠ task correctness.** JSONSchemaBench measures *whether* a framework produces
  schema-valid output and at what cost; it deliberately separates that from output quality. StructEval and
  JSONSchemaBench both show structural generation is hard for models even when the format is simple, and
  JSONSchemaBench's third dimension (quality) exists precisely because compliance is not enough. **[Fact:
  both papers state this design. Interpretation: the Lab's rubric must keep "format" and "substantive
  correctness" as separate criteria — which AGENT-EVAL-LAB.md grading rule 3 already requires.]**
- **Constraining the output space can degrade reasoning.** Tam et al. (2024) report a significant decline
  in reasoning ability under format restrictions, with stricter constraints tending to hurt more. This is
  the single most important caution for a judge-role harness that forces JSON. **[Fact: abstract. The
  magnitude is model- and task-dependent; do not generalize without local replication.]**
- **Agentic tool-use evaluation has moved to state-based, outcome-oriented grading.** BFCL V3 and tau-bench
  grade the *end state* of a simulated API/backend rather than string-matching a response, and tau-bench
  introduced `pass^k` to measure consistency across repeated trials. This directly supports the Lab's
  "repetitions measure consistency, not breadth" rule.
- **Tool-use benchmarks are largely graded by other LLMs or by execution.** tau-bench and StableToolBench
  use LLM-simulated users/evaluators; BFCL V3 layers deterministic state-checks over those. LLM-as-judge is
  scalable but carries documented position, verbosity, and self-enhancement biases (MT-Bench). The Lab's
  preference for **deterministic graders first, calibrated semantic graders second** is well founded.
- **Small models struggle most with output format, not prompting.** The EASE 2025 SLM study finds SLMs
  improve from zero-shot to few-shot and best with fine-tuning, but "struggle significantly with adhering
  to the given output format." For a local-first project this is the crux: a small local model may need
  constrained decoding to be usable as a structured judge.
- **What to reuse:** the *evaluation methodology* — end-state verification, subset-matched trajectories,
  `pass^k`-style consistency, separation of format vs correctness vs cost. **What to adapt:** the Eval Lab's
  role/case/suite/key model already mirrors the good parts of these designs. **What to borrow:** endpoint
  tasks and negative-control ideas (missing function, missing parameter, long-context, ambiguous input) from
  BFCL V3 and ACEBench. **What to reject as a truth source:** any single benchmark score presented as
  production qualification, and any provider's "structured outputs" marketing as proof of quality.

---

## 3. Landscape by layer

### 3a. Constrained / structured decoding engines

- **Outlines — FSM-guided generation.** `Efficient Guided Generation for Large Language Models`, Willard &
  Louf, arXiv:2307.09702 (v1 2023-07-19; v4 2023-08-19). Reframes generation as transitions between states
  of a finite-state machine and builds an **index over the model vocabulary**, allowing regexes and
  context-free grammars to constrain decoding with "little overhead." Explicitly **model agnostic**. The
  reference open-source implementation is the Python library Outlines. arXiv article license: CC BY 4.0.
  *Type: method + open-source engine.*
- **LMQL — constrained decoding as a query language.** `Prompting Is Programming: A Query Language for Large
  Language Models`, Beurer-Kellner, Fischer & Vechev, arXiv:2212.06094 (v1 2022-12-12; v3 2023-05-30;
  published PLDI'23). Generalizes prompting into a scripting language (Language Model Programming) with
  constraints over output, producing an inference procedure that "minimizes the number of expensive calls."
  Reports 26–85% cost savings on pay-to-use APIs. arXiv license: CC BY 4.0. *Type: method + engine +
  programming model.*
- **XGrammar — performance-focused CFG engine.** `XGrammar: Flexible and Efficient Structured Generation
  Engine for Large Language Models`, Dong et al., arXiv:2411.15100 (v1 2024-11-22; v3 2025-05-12; MLSys '25).
  Splits vocabulary into **context-independent tokens** (prechecked) and **context-dependent tokens**
  (checked at runtime with a persistent stack), and co-designs with the inference engine to overlap grammar
  work with GPU execution. Claims **up to 100× speedup over existing solutions** and near-zero end-to-end
  overhead. arXiv license: CC BY-SA 4.0. *Type: method + engine.*
- **llguidance.** GitHub `guidance-ai/llguidance` — a library for "super-fast structured outputs," the
  grammar engine lineage from the Guidance project. *Type: open-source engine.* (Repository read at a high
  level; no license verification performed here.)
- **llama.cpp GBNF grammars.** `ggml-org/llama.cpp` `grammars/README.md` — GBNF grammar support in the
  llama.cpp inference stack. Relevant because it is the local-inference path a Mister Clean local seat is
  most likely to touch. *Type: open-source engine / runtime feature.*
- **SGLang.** `SGLang: Efficient Execution of Structured Language Model Programs`, Zheng et al.,
  arXiv:2312.07104 (2023-12). Cited here for context only; **not re-read in full for this report**, so no
  specific claim is made about its results. *Type: system / runner.*

**[Interpretation]** The engine layer gives Mister Clean a real lever: if a local small model "struggles
with adhering to the output format" (SLM study), a grammar or JSON-Schema constraint can remove format
failures as a confounder and let the Lab measure *substantive* capability. The Lab should treat the decoding
engine as part of the observed identity (AGENT-EVAL-LAB.md already binds serving configuration), because
grammar-constrained vs unconstrained decoding are different treatments.

### 3b. Provider structured-output and tool-call APIs

- **OpenAI Structured Outputs.** OpenAI's structured-outputs guide distinguishes **strict `json_schema`**
  (schema-constrained) from **JSON mode** (valid JSON, schema not guaranteed). *Type: provider capability
  + API contract.* **[Interpretation]** The strict/JSON-mode distinction is exactly the kind of
  identity/serving detail AGENT-EVAL-LAB.md's "execution route" axis is meant to capture; a report that
  says "used structured outputs" without saying which mode is not reproducible.
- **Anthropic tool use.** Anthropic's tool-use documentation (now served from `platform.claude.com`)
  describes client tools vs server tools and the tool-use loop. *Type: provider capability.*
- **Google Gemini function calling / controlled generation.** Google publishes function-calling and
  controlled-generation documentation, but the `ai.google.dev` fetch failed with a transport error on
  2026-10-09; **no feature claims are made here** and the source is listed as not-obtained in §7.

**[Interpretation]** Provider APIs are the least inspectable layer: behavior is versioned behind a hosted
endpoint, so a provider result is a weak basis for cross-project truth. This supports EV-02's insistence on
versioned definition revisions and EV-04's separation of provider cost/speed telemetry from quality credit.

### 3c. Schema-adherence benchmarks

- **JSONSchemaBench.** `A Rigorous Benchmark of Structured Outputs for Language Models`, Geng et al.,
  arXiv:2501.10868 (v1 2025-01-18; v3 2025-02-27). **10K real-world JSON schemas** plus the official JSON
  Schema Test Suite; evaluates **six** frameworks — Guidance, Outlines, Llamacpp, XGrammar, OpenAI, and
  Gemini — across three dimensions: **efficiency** (constraint-compliant generation), **coverage** of
  constraint types, and **quality** of generated output. Repo: `guidance-ai/jsonschemabench`. arXiv
  license: CC BY 4.0. *Type: benchmark + dataset + evaluation framework.* This is the closest single
  artifact to "does constrained decoding actually work on real schemas," and its three-dimension framing is
  a useful template for the Lab's per-criterion reporting.
- **StructEval.** `Benchmarking LLMs' Capabilities to Generate Structural Outputs`, Yang et al.,
  arXiv:2505.20139 (v1 2025-05-26; v3 2026-04-02). **18 formats** (JSON, YAML, CSV, HTML, React, SVG) and
  **44 task types**, split into *generation* (NL → structure) and *conversion* (structure ↔ structure)
  paradigms, with metrics for format adherence and structural correctness. Reports o1-mini achieving only
  **75.58** average, open-source ~10 points behind, generation harder than conversion, visual output harder
  than text-only. arXiv license: CC BY 4.0. *Type: benchmark + grader.* CAUTION: this is a **structural
  fidelity** benchmark, not a tool-use or role-capability benchmark.

**[Interpretation]** Both are *format-centric*. They answer "can the model produce the structure," not "is
the structure the right answer." Mister Clean should borrow their separation of format-adherence from
structural-correctness but must not let a high StructEval/JSONSchemaBench number stand in for role fitness.

### 3d. Tool-use / agentic benchmarks

- **BFCL (Berkeley Function-Calling Leaderboard).** Gorilla, `gorilla.cs.berkeley.edu`; BFCL V3
  multi-turn/multi-step blog released 2024-09-19, last updated 2024-12-10; BFCL V4 exists (referenced from
  the V3 page). V3 adds multi-turn and multi-step categories built from hand-curated API codebases, a
  function graph, Persona-Hub-derived queries, and **human-labeled ground-truth trajectories** with
  11 rounds of data filtering. Grading is **state-based** (compare backend state after execution) plus
  **subset-matched response-based** (model trajectory must contain the minimal viable ground-truth path as a
  subset). Explicit negative categories: missing parameters, missing functions, long-context, composite.
  BFCL deliberately avoids ReAct/prompt-engineering to isolate base model behavior. Overall V3 score is an
  unweighted average across single-turn, live, and multi-turn blocks. *Type: benchmark + runner + grader +
  human-annotated dataset.*
- **Gorilla / APIBench.** `Gorilla: Large Language Model Connected with Massive APIs`, Patil et al.,
  arXiv:2305.15334 (2023-05-24). Finetuned LLaMA + document retriever; introduces **APIBench**
  (HuggingFace, TorchHub, TensorHub APIs); targets API-call accuracy and hallucination reduction. arXiv
  license: CC BY 4.0. *Type: method + model + dataset.* This is the ancestor of BFCL.
- **APIGen / xLAM.** `APIGen: Automated Pipeline for Generating Verifiable and Diverse Function-Calling
  Datasets`, Liu et al., arXiv:2406.18518 (2024-06-26). Automated pipeline over **3,673 executable APIs in
  21 categories**, with three verification stages (format check, actual execution, semantic verification);
  releases a **60K-entry** dataset; reports a 7B model reaching SOTA on BFCL and a 1B model beating
  GPT-3.5-Turbo and Claude-3 Haiku. Dataset: `Salesforce/xlam-function-calling-60k`; project
  `apigen-pipeline.github.io`. arXiv license: CC BY 4.0. *Type: dataset generator + dataset + training
  method.* **[Interpretation]** APIGen's claim that a 1B model can beat much larger models on BFCL is the
  strongest published evidence that *training data + constrained task design* can substitute for scale in
  function calling — highly relevant to a local-first project.
- **ACEBench.** `Who Wins the Match Point in Tool Usage?`, Chen et al., arXiv:2501.12851 (v1 2025-01-22;
  v8 2025-11-20). Data split into **Normal / Special / Agent** — Normal = basic tool use, Special =
  ambiguous or incomplete instructions, Agent = multi-agent multi-turn. Designed to avoid LLM- or
  real-API-execution evaluation overhead. arXiv license: **CC BY-NC-ND 4.0 (non-commercial, no
  derivatives)**. *Type: benchmark + grader.* The NC-ND license is a hard reuse constraint.
- **StableToolBench.** Guo et al., arXiv:2403.07714 (v1 2024-03-12; v5 2025-03-05). Evolves ToolBench by
  adding a **virtual API server** (caching + API simulators) and a stable evaluation system with
  "solvable pass and win rates," using **GPT-4 as automatic evaluator** to reduce API-status nondeterminism.
  arXiv license: arXiv non-exclusive license. *Type: benchmark + runner + LLM grader.*
- **ToolSandbox.** ACL 2025 Findings (Apple), `aclanthology.org/2025.findings-naacl.65/` — stateful
  tool-use evaluation; cited from the BFCL V3 dataset-comparison table (which lists it as human-curated,
  multi-step, multi-turn, implicit-action, self-correct). *Type: benchmark.* (Not re-read in full here.)
- **tau-bench.** `τ-bench: A Benchmark for Tool-Agent-User Interaction in Real-World Domains`, Yao et al.,
  arXiv:2406.12045 (2024-06-17). Simulates dynamic user↔agent conversations with domain-specific API tools
  and **policy guidelines**; grades by comparing the **database state** at conversation end against the
  annotated goal state; introduces **`pass^k`** for reliability across trials. Reports gpt-4o succeeding on
  **<50%** of tasks and `pass^8 <25%` in retail. *Type: benchmark + runner + state-based grader +
  reliability metric.*
- **tau²-bench.** `τ²-Bench: Evaluating Conversational Agents in a Dual-Control Environment`, Barres et al.,
  arXiv:2506.07982 (2025-06-09). Adds a **dual-control** domain (Telecom) modeled as a Dec-POMDP where both
  agent *and* user act on a shared world; compositional verifiable task generator; environment-coupled user
  simulator; ablations separating reasoning vs communication/coordination errors. Reports "significant
  performance drops" moving from no-user to dual-control. arXiv license: CC BY 4.0. *Type: benchmark +
  runner + user simulator + grader.*
- **API-Bank, ComplexFuncBench, Seal-Tools, Nexus, etc.** Known in the space but **not re-read in full for
  this report**; listed in §7 as not-obtained. No claims are made about them.

**[Interpretation]** Three design ideas are portable regardless of which benchmark Mister Clean uses:
(1) **grade the world, not the words** (state-based / execution-based checking); (2) **subset-match**
trajectories so exploration and error-recovery are not penalized (BFCL V3); (3) **measure consistency
across repeats** (`pass^k`), which maps directly onto the Lab's repetitions-vs-breadth rule.

### 3e. Small-model function calling

- **Small Models, Big Tasks.** Kavathekar et al., arXiv:2504.19277 (2025-04-27; accepted EASE 2025, AI Models
  and Data Evaluation track). Evaluates SLMs on function-call generation with zero-shot, few-shot, and
  fine-tuning, with and without prompt injection; also measures edge-device latency and memory. Findings:
  SLMs improve zero-shot → few-shot → best with fine-tuning, but **"struggle significantly with adhering to
  the given output format"**; prompt injection causes only slight decline (models "generally robust").
  arXiv license: CC BY-SA 4.0. *Type: empirical study + released fine-tuned models.*
- **xLAM / APIGen** (see §3d) is the training-side counterpart: a 1B model beating GPT-3.5-Turbo and
  Claude-3 Haiku on BFCL. *Type: dataset + training method.*

**[Interpretation]** For Mister Clean these two together are the key small-model result: the bottleneck for
local models is **format control**, and constrained decoding or task-specific fine-tuning is the plausible
fix. This is an argument for making the decoding engine and the training/fine-tuning provenance part of
observed identity, and for a first Lab slice that uses constrained decoding rather than fighting format
failures with prompting.

### 3f. Constraint versus quality conflict

- **Let Me Speak Freely?** Tam et al., arXiv:2408.02442 (v1 2024-08-05; v3 2024-10-14). Tests whether
  constraining generation space to JSON/XML affects LLM reasoning and domain-knowledge comprehension.
  Reports a **significant decline in reasoning under format restrictions**, and that **stricter format
  constraints generally cause greater degradation**. arXiv license: CC BY-SA 4.0. *Type: empirical study.*

**[Interpretation]** This is the central tension of the entire area: the very mechanism that guarantees
parseable output (constrained decoding / strict schemas) can suppress the reasoning a judge-role task needs.
Practical implications for the Lab: (a) never average format and correctness into one score (AGENT-EVAL-LAB
already forbids this); (b) treat "constrained vs free-form" as an explicit treatment axis in experiments;
(c) when a role needs reasoning, consider free-form reasoning followed by a separate structured-extraction
step rather than constraining the reasoning token stream. Note the paper's scope — decline is observed on
*reasoning tasks*, and magnitude is model/task dependent; it is not a blanket "JSON is bad" result.

### 3g. Grading, reliability, and contamination caveats

- **LLM-as-a-judge / MT-Bench & Chatbot Arena.** Zheng et al., arXiv:2306.05685 (v1 2023-06-09; v4
  2023-12-24; NeurIPS 2023 Datasets & Benchmarks). Documents **position, verbosity, and self-enhancement
  biases** and limited reasoning in LLM judges, proposes mitigations, and reports strong judges (GPT-4)
  reaching **>80% agreement** with human preferences. arXiv license: arXiv non-exclusive license. *Type:
  benchmark + grader methodology.*
- **StableToolBench** (above) is an explicit attempt to remove nondeterminism from LLM-based evaluation.
- **Benchmark contamination** is a general risk stated in the literature; none of the sources above provide
  a per-Mister-Clean contamination proof. **[Interpretation]** The Lab's "held-out cases" and "exposure
  history" concepts (AGENT-EVAL-LAB.md) are the right structural answer, but exposure of any *public*
  benchmark used by the Lab is inherently unprovable from the outside.

**[Interpretation]** The grading literature says: prefer deterministic graders, and when a semantic grader
is unavoidable, calibrate it against human labels and measure its agreement — do not assume it is correct.

---

## 4. Comparison table

Type labels: **B**enchmark, **D**ataset, **R**unner/harness, **G**rader, **E**ngine/library,
**T**elemetry-evidence, **UI**. Legacy label **A**PI/capability.

| Item | Type | What it measures | Grading approach | License (arXiv article, as seen) | Relevance to Lab |
|---|---|---|---|---|---|
| Outlines (arXiv:2307.09702) | E | Constrained generation via FSM + vocab index | N/A (mechanism) | CC BY 4.0 | Decoding engine = treatment axis |
| LMQL (arXiv:2212.06094) | E, R | Constrained generation + query control flow | N/A | CC BY 4.0 | Prior art for structured prompting; cost savings claim |
| XGrammar (arXiv:2411.15100) | E | CFG-constrained decoding overhead | N/A | CC BY-SA 4.0 | Performance engine for local serving |
| llguidance (GitHub) | E | Structured outputs | N/A | not verified | Candidate local engine |
| llama.cpp GBNF (GitHub) | E | Grammar-constrained decoding | N/A | not verified | Local-inference path |
| SGLang (arXiv:2312.07104) | R, E | Structured program execution | N/A | not verified | Context only (not re-read) |
| OpenAI Structured Outputs | A | Strict json_schema vs JSON mode | Provider-enforced | n/a (docs) | Capture mode in identity |
| Anthropic tool use | A | Client vs server tool loop | Provider runtime | n/a (docs) | Provider behavior stratum |
| Gemini function calling | A | — | — | n/a (docs) | **Not obtained** (transport error) |
| JSONSchemaBench (arXiv:2501.10868) | B,D,R,G | Efficiency, coverage, quality over 10K schemas | Framework-instrumented | CC BY 4.0 | Template for 3-dim reporting |
| StructEval (arXiv:2505.20139) | B,G | 18 formats / 44 tasks structural fidelity | Format-adherence + structural | CC BY 4.0 | Format vs substance separation |
| BFCL V3 (Gorilla) | B,D,R,G | Multi-turn/step tool use | State-based + subset-matched | CC BY 4.0 (paper lineage) | Portable grading design |
| Gorilla/APIBench (arXiv:2305.15334) | D | API-call accuracy | AST/execution | CC BY 4.0 | Ancestor, hallucination focus |
| APIGen/xLAM (arXiv:2406.18518) | D | Trainable function-calling data | Format+exec+semantic | CC BY 4.0 | Small-model path; 1B > GPT-3.5 claim |
| ACEBench (arXiv:2501.12851) | B,G | Normal/Special/Agent tool use | Rule-based | **CC BY-NC-ND 4.0** | Ambiguity cases; **NC-ND reuse limit** |
| StableToolBench (arXiv:2403.07714) | B,R,G | Stable tool learning eval | GPT-4 judge | arXiv non-exclusive | Nondeterminism control idea |
| tau-bench (arXiv:2406.12045) | B,R,G | User↔agent, policy-following | DB-state + pass^k | CC BY 4.0 | State grading + reliability |
| tau²-bench (arXiv:2506.07982) | B,R,G | Dual-control coordination | Env-coupled sim + grader | CC BY 4.0 | Dual-control / user-guidance test |
| ToolSandbox (ACL 2025) | B | Stateful tool use | — | n/a | Not re-read |
| SLM function calling (arXiv:2504.19277) | Study,D | SLM format adherence + edge cost | Metrics suite | CC BY-SA 4.0 | Central local-model finding |
| Let Me Speak Freely (arXiv:2408.02442) | Study | Format restriction vs reasoning | Task metrics | CC BY-SA 4.0 | Constraint/quality conflict |
| MT-Bench/LLM-judge (arXiv:2306.05685) | B,G | Judge bias + human agreement | Human comparison | arXiv non-exclusive | Grader calibration |

**License caveat (important).** The licenses above are the *arXiv article* metadata shown on each abstract
page. They are **not** the licenses of the accompanying code, datasets, or models, which must be checked
separately for each artifact before any reuse. ACEBench is the only item here whose *article* license
(CC BY-NC-ND 4.0) already restricts reuse.

---

## 5. Reuse / adapt / borrow / reject

**[Recommendation]** — clearly labeled as my recommendation, not a source finding.

- **Reuse (methodology):**
  - BFCL V3's **state-based grading + subset-matched trajectories** for anything that has a verifiable end
    state. It directly matches AGENT-EVAL-LAB's "separate format / substantive correctness / false
    rejection / missed defects" rule.
  - tau-bench's **`pass^k`** consistency metric and tau²-bench's **reasoning-vs-coordination error
    separation** — map onto the Lab's repetitions and multi-reviewer reliability sections.
  - JSONSchemaBench's **orthogonal dimensions (efficiency, coverage, quality)** — mirror as separate
    report measures rather than one average.
- **Adapt:**
  - The **Agent Eval Lab role/case/suite/key model already mirrors the good parts** of these benchmarks
    (sealed cases, hidden keys, append-only regrades, exposure history). No new bespoke harness is needed
    to start; the Lab is the harness.
  - **Constrained decoding as an identity/treatment axis**, not a hidden default. Record engine + version +
    schema mode in observed identity.
  - **Endpoint/negative controls** adapted from BFCL V3: missing parameter, missing function, long context,
    composite, and ACEBench's ambiguous/incomplete "Special" category.
- **Borrow:**
  - **APIGen's three-stage verification** (format → execution → semantic) as a pattern for verifying any
    synthesized evaluation case before it enters a sealed suite.
  - **StableToolBench's virtual API server / caching** idea to make tool evaluation deterministic and cheap
    locally — a strong fit for a machine-local, no-provider deployment.
  - **MT-Bench's bias controls** (position swap, verbosity controls) when the Lab must use a semantic
    grader.
- **Reject / do not adopt:**
  - Any **single benchmark score as production qualification**. BFCL, StructEval, JSONSchemaBench all
    measure narrow capabilities under specific conditions; EV-04 already states that benchmark grades do
    not automatically become native production-work trials.
  - **Provider "structured outputs" claims as quality evidence.** They guarantee format, not correctness.
  - **Constraining the reasoning stream** where the role needs reasoning, unless a local replication shows
    the degradation is acceptable (Tam et al.).
  - **Copying ACEBench data/derivatives** without resolving the CC BY-NC-ND 4.0 restriction (idea-level
    borrowing of the Normal/Special/Agent taxonomy is separate from copying content).

---

## 6. Open questions and evidence gaps

1. **No local replication.** None of the format-vs-reasoning or SLM-format findings were verified on the
   actual local models Mister Clean would use. The Tam et al. and SLM results should be treated as
   hypotheses to test locally, not settled facts for this project.
2. **Unmeasured interaction: constrained decoding × prompt injection × small models.** The SLM study tests
   prompt injection without constrained decoding; the engines tests are not security studies. Whether a
   grammar-constrained small model is more or less robust to injection is **unknown**.
3. **Grader reliability for Mister Clean's specific rubrics.** MT-Bench gives general LLM-judge agreement
   figures; none of that establishes agreement for Mister Clean's categories (e.g. Spit-shine, Wayfinding).
   Local calibration is required.
4. **Cost figures are not comparable across sources.** LMQL's 26–85% savings, XGrammar's 100× speedup, and
   provider pricing each use different units, baselines, and time bases. None are stated in a form that
   lets Mister Clean treat them as a single budget input.
5. **Licensing of code/data/models is unresolved** for every artifact except the article-level metadata
   above. This is a blocker for any direct reuse and was not clearance-checked here.
6. **Contamination/exposure of public benchmarks is unprovable from outside.** No source provides exposure
   proof usable by the Lab.
7. **Provider behavior is versioned and opaque.** No provider-offered guarantee was verified by execution;
   provider results should be treated as time-bound strata.
8. **Sources not obtained / not re-read in full:** Google Gemini function-calling docs (transport error),
   SGLang (cited only), ToolSandbox, and the API-Bank / ComplexFuncBench / Seal-Tools / Nexus line. Claims
   in this report deliberately avoid these beyond what is quoted.

---

## 7. Sources

All accessed and read **2026-10-09** unless noted. "Article license" = license shown on the arXiv abstract
page, not the code/data license.

1. Willard & Louf, *Efficient Guided Generation for Large Language Models*, arXiv:2307.09702, v1 2023-07-19,
   v4 2023-08-19. https://arxiv.org/abs/2307.09702 — article license CC BY 4.0.
2. Beurer-Kellner, Fischer & Vechev, *Prompting Is Programming: A Query Language for Large Language Models*,
   arXiv:2212.06094, v1 2022-12-12, v3 2023-05-30 (PLDI'23). https://arxiv.org/abs/2212.06094 — CC BY 4.0.
3. Dong et al., *XGrammar: Flexible and Efficient Structured Generation Engine for Large Language Models*,
   arXiv:2411.15100, v1 2024-11-22, v3 2025-05-12 (MLSys '25). https://arxiv.org/abs/2411.15100 — CC BY-SA 4.0.
4. `guidance-ai/llguidance`, GitHub. https://github.com/guidance-ai/llguidance — license not verified here.
5. `ggml-org/llama.cpp`, `grammars/README.md` (GBNF grammars). GitHub — license not verified here.
6. Zheng et al., *SGLang: Efficient Execution of Structured Language Model Programs*, arXiv:2312.07104,
   2023-12. https://arxiv.org/abs/2312.07104 — cited only, not re-read.
7. Geng et al., *JSONSchemaBench: A Rigorous Benchmark of Structured Outputs for Language Models*,
   arXiv:2501.10868, v1 2025-01-18, v3 2025-02-27. https://arxiv.org/abs/2501.10868 — CC BY 4.0; repo
   `guidance-ai/jsonschemabench`.
8. Yang et al., *StructEval: Benchmarking LLMs' Capabilities to Generate Structural Outputs*,
   arXiv:2505.20139, v1 2025-05-26, v3 2026-04-02. https://arxiv.org/abs/2505.20139 — CC BY 4.0.
9. Gorilla / BFCL V3, *Multi-Turn & Multi-Step Function Calling*, released 2024-09-19, updated 2024-12-10.
   https://gorilla.cs.berkeley.edu/blogs/13_bfcl_v3_multi_turn.html (V4 referenced on same page).
10. Patil et al., *Gorilla: Large Language Model Connected with Massive APIs*, arXiv:2305.15334, 2023-05-24.
    https://arxiv.org/abs/2305.15334 — CC BY 4.0.
11. Liu et al., *APIGen: Automated Pipeline for Generating Verifiable and Diverse Function-Calling
    Datasets*, arXiv:2406.18518, 2024-06-26. https://arxiv.org/abs/2406.18518 — CC BY 4.0; dataset
    `Salesforce/xlam-function-calling-60k`.
12. Chen et al., *ACEBench: Who Wins the Match Point in Tool Usage?*, arXiv:2501.12851, v1 2025-01-22,
    v8 2025-11-20. https://arxiv.org/abs/2501.12851 — **CC BY-NC-ND 4.0**.
13. Guo et al., *StableToolBench: Towards Stable Large-Scale Benchmarking on Tool Learning of Large Language
    Models*, arXiv:2403.07714, v1 2024-03-12, v5 2025-03-05. https://arxiv.org/abs/2403.07714 — arXiv
    non-exclusive license.
14. Yao et al., *τ-bench: A Benchmark for Tool-Agent-User Interaction in Real-World Domains*,
    arXiv:2406.12045, 2024-06-17. https://arxiv.org/abs/2406.12045 — CC BY 4.0.
15. Barres et al., *τ²-Bench: Evaluating Conversational Agents in a Dual-Control Environment*,
    arXiv:2506.07982, 2025-06-09. https://arxiv.org/abs/2506.07982 — CC BY 4.0.
16. ToolSandbox, Findings of NAACL 2025 (Apple). https://aclanthology.org/2025.findings-naacl.65/ — not
    re-read in full.
17. Kavathekar et al., *Small Models, Big Tasks: An Exploratory Empirical Study on Small Language Models for
    Function Calling*, arXiv:2504.19277, 2025-04-27 (EASE 2025). https://arxiv.org/abs/2504.19277 —
    CC BY-SA 4.0.
18. Tam et al., *Let Me Speak Freely? A Study on the Impact of Format Restrictions on Performance of Large
    Language Models*, arXiv:2408.02442, v1 2024-08-05, v3 2024-10-14. https://arxiv.org/abs/2408.02442 —
    CC BY-SA 4.0.
19. Zheng et al., *Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena*, arXiv:2306.05685, v1 2023-06-09,
    v4 2023-12-24 (NeurIPS 2023 D&B). https://arxiv.org/abs/2306.05685 — arXiv non-exclusive license.
20. OpenAI, *Structured Outputs* guide and *Function calling / tool use* docs. Not date-pinned in this
    report; provider pages are live and versioned.
21. Anthropic, *Tool use* overview (`platform.claude.com/docs/en/agents-and-tools/tool-use/overview`).
    Live/versioned.
22. **Not obtained:** Google Gemini function calling / controlled generation docs — `ai.google.dev` fetch
    failed with a transport error on 2026-10-09.

---

*Report status: research complete for the sources listed. All providers, engines, and benchmarks were
reviewed read-only; no execution, inference, provider connection, or repository change was performed. This
document makes no claim of production readiness or role qualification for Mister Clean.*
