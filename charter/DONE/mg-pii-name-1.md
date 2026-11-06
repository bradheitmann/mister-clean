# DONE: mg-pii-name-1 (remove the owner's first name from public planning text)
Slice: mister-clean is a public repository, and three planning lines name the owner by his first name. That breaks the owner's 2026-11-05 PII ruling (never his name; write "the owner"). Replace each with "the owner". Change nothing else. Earlier revisions still contain the name, and history is not rewritten (owner ruling). The name itself lives only in private files outside the repository and is never written here.
Proofs (each re-openable before acceptance):
1. No whole-word owner first name remains in tracked files.
   - reopen: `git grep -I -n -w -i -c -f ~/.local/share/agent-private/owner-first-name.txt -- . | wc -l` prints 0. The file is private and never printed.
   - mutant: restore any one of the three lines, and the count is non-zero (RED).
2. No owner-PII pattern match in tracked files.
   - reopen: `git grep -I -i -c -F -f ~/.local/share/agent-private/owner-pii-patterns.txt | wc -l` prints 0. The file is private and never printed.
   - mutant: add a home path containing the owner's username, and the count is non-zero (RED).
3. The planning audit result is unchanged by the edit: `node ~/.claude/skills/mister-clean/bin/mister-clean.js audit planning . --json` reports status pass with 0 findings, the same as the base.
   - reopen: the command as named.
   - mutant: n/a (comparison with the base).
4. The edit is exactly three line replacements, in project/planning/EVAL-STANDARDIZATION-PLAN.md (2) and project/planning/ROADMAP.md (1), and `charter check --strict` is ok.
   - reopen: `git diff --stat <base>..<frozen head> -- project/` shows those 2 files with 3 insertions and 3 deletions; charter check --strict.
   - mutant: n/a.
After acceptance, NOT proofs: merge into main in the canonical landing shape, with the acceptance records inside the merge commit; the post-merge self-judge is noted in STATE.
