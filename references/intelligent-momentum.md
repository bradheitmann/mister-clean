# Intelligent Momentum — the doctrine

## The mechanism

Large language models are next-token predictors. When an agent opens a
repository, everything it reads — the branch list, the planning tree, the last
ten commit messages, the shape of the most recent slice — becomes context that
conditions everything it writes. **The repository is the prompt.**

This has three consequences, and the skill exists because of them:

1. **Uniformity compounds.** An agent that reads twenty structurally identical
   planning artifacts will produce a twenty-first in the same shape, without
   being told to, because that is what the context makes probable. The corpus
   trains its own contributors.

2. **Variance compounds too.** Every divergent artifact — a slice with
   different sections, a phase value outside the vocabulary, an abandoned
   worktree, a README count that no longer matches — is a licensed precedent.
   The next agent cannot tell deliberate variation from drift, so some of them
   will imitate the drift. Same model, same effort, worse output.

3. **Recency dominates, but survivors linger.** Agents weigh what they
   encounter first and most — the most recent artifacts, the entry-point docs.
   But *any* surviving counterexample can be sampled by an agent that greps its
   way into history. This is why retroactive conformance is real work, not
   busywork: fixing the format of an artifact whose work shipped a month ago
   removes a counterexample from the training context of every future session.

## Wax on, wax off

In *The Karate Kid*, Mr. Miyagi has his student paint the fence and wax the car
— identical strokes, endlessly repeated, no explanation. The student resents
the repetition until he discovers the strokes *are* the art: the uniformity was
never busywork, it was muscle memory for the moment that matters.

Planning artifacts work the same way. Every slice written in the exact
canonical form, every commit message in the parsed format, every branch cleaned
after merge — each repetition looks trivial, and together they *are* the
system. An agent that has only ever seen wax-on/wax-off produces wax-on/wax-off.
That is not a metaphor for training humans; it is a literal description of how
a next-token predictor behaves in a uniform corpus.

## Portable enforcement — the deepest reason

Validators, hooks, and gates enforce the standard **for the current team, on
the current machines**. They do not travel. The next team may work in a
different harness, with different models, and none of your validators wired in.

What travels is the corpus. If the historical artifact is uniform enough, the
standard is **implied by the pattern itself**, and a model conforms by
prediction alone — no validator required. This is the design goal stated
precisely:

> Enforcement mechanisms protect the pattern for this team.
> The pattern protects itself for every team after.

A collaborator with their own systems, their own quality controls, their own
orchestration can be dropped into the repo — and to the extent their tools are
built on language models, the models will look at what was built and build in
conformance. You are not trusting their validators. You are trusting the
momentum of your own corpus.

## The complexity budget

As team complexity grows — more agents, more harnesses, more surfaces running
simultaneously — the complexity of the *object* they work on must shrink, or
the product of the two becomes unmanageable. The reductions this skill seeks,
within repository policy, are exactly that budget being paid:

- the smallest owned branch/worktree topology the active workflow requires —
  no abandoned or unexplained surfaces
- one designated current directive per scope — no ambiguity about what to do
  next
- one artifact shape per type — no decisions about how to write things down
- zero debris — no noise competing with signal for the model's attention

These are entropy targets, not universal numeric constants. A repository may
legitimately retain multiple release branches, policy-owned worktrees, or
independent active directives; Mister Clean proves each one's purpose and
disposition instead of deleting healthy topology to imitate a template.

The end state of every session is the starting state of the next one. A crew
that inherits a pristine repo spends its first hour producing, not excavating
the prior crew's mess — and its output joins the pattern instead of fighting it.

## Structure IS the signal — lanes, folders, code alike

> "Lane position carries massive signal … nearly as much signal as git, or it
> is supposed to. Otherwise why have lanes at all? Code structure / file
> structure all carry massive signal. Structure and purpose are deeply,
> intimately connected in terms of the signal they send and what they imply
> should happen next." — operator ruling, 2026-08-24

Position is the first thing an agent reads and the last thing anyone
maintains. A lane, a folder, a file's location — each is a claim about
purpose, and each **implies the next action**: a slice in `todo/` says "claim
me"; a test under `tests/` says "run me"; a doc in `research/` says "context,
not contract." When structure and truth agree, the agent's first instinct is
the correct one, before any prose is read.

The corollary that bites: **a convention that neutralizes a structural signal
— "ignore the lane for this artifact class," "that folder is misc" — does not
make the signal go away. It makes it lie**, and then papers over the lie with
a disclaimer every reader must memorize. Case measured in the wild: a corpus
whose rule was "QA slices stay in backlog forever; don't infer state from
position" was found holding **41 executed, verdict-anchored reviews in
backlog/**, each asserting nothing had ever happened. The fix was not a
better disclaimer; it was moving the artifacts so position and git answered
alike — after which the disclaimer could be deleted.

Rule for the skill: **never document around a structural lie; correct the
structure toward truth.** If a lane, folder, or file location disagrees with
ground truth, the position is what's wrong — and if a *convention* mandates
the disagreement, the convention is the finding.
