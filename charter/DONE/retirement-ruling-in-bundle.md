# DONE: retirement-ruling-in-bundle (field defect from odin, 7.4.0)
Slice: `prepare` writes each retired debt's `exception.ref = {path, sha256}` with the repository-relative path of the cited ruling, but the bundle validator resolves refs inside the bundle directory and `prepare` never staged the ruling there. Every correctly retired tree therefore failed `validate bundle` (odin PR #34: 962 errors, all `exception.ref.path: file not found`). Stage each cited ruling into the bundle under its repository-relative path, verifying the bound digest, so the bundle is self-contained.

1. After `prepare` on a tree with a retirement record, the cited ruling exists at `<bundle>/<ruling path>` with the sha256 the exception ref names.
   - reopen: `node ./node_modules/vitest/vitest.mjs run src/closeout/prepare.test.ts -t "retires every debt"`
   - mutant: skip the staging → the file is absent → RED.
2. Validating that bundle reports no `exception.ref` error.
   - reopen: same test (asserts the validator's error list has no `exception.ref` entry).
   - mutant: as 1 → the validator reports `exception.ref.path: file not found` → RED.
3. If the ruling's bytes differ from the bound digest at staging time, prepare refuses rather than staging mismatched bytes.
   - reopen: `… -t "refuses to stage a ruling"`
   - mutant: copy without re-checking → RED.
4. Regression: prepare, bundle and retirement tests green; skill-contract; tsc; charter strict; audit:public; double build + manifest check under bun 1.4.0.
   - reopen: the commands as named.
   - mutant: n/a (regression set).
