# DONE: rotate-local-stores (owner decision 2026-11-04; SEM-STATE-8CF757A62803, SEM-STATE-C6FB0796C5F5)
Slice: the invocation journal and the run-receipt index are append-only files with no bound, fully re-read on every construction or lookup. Per the owner decision (`charter/owner-decisions/2026-11-04-local-store-retention.md`), each store keeps a live segment under a named maximum. Appending past it seals the live segment: renamed to a numbered, read-only file with a manifest entry carrying its digest and range. A new live segment then starts. Nothing is ever deleted. Readers read only the segments they need, and a sealed segment whose bytes changed is a typed refusal.

All reopen commands run `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 node ./node_modules/vitest/vitest.mjs run src/local-store-rotation.test.ts -t "<filter>"`. Tests use temp roots only, never `~/.local/state/mister-clean`.

1. Appending past the cap seals a segment (read-only, manifest entry with sha256 and range) and starts a new live segment; the live file stays ≤ cap.
   - reopen: `-t "seals at the cap"`
   - mutant: no sealing → RED.
2. No sealed segment is ever deleted: after N seals all records are readable and the total record count equals the number appended.
   - reopen: `-t "keeps every record"`
   - mutant: delete the oldest sealed segment on seal → RED.
3. A lookup by id reads only the manifest, the live segment and the one sealed segment that holds the id (file reads instrumented in the test).
   - reopen: `-t "lookup by id"`
   - mutant: read every segment → RED.
4. A sealed segment with one byte changed is a typed refusal on read.
   - reopen: `-t "one byte changed"`
   - mutant: skip the digest check → RED.
5. A crash between the segment rename and the manifest write leaves a readable, consistent store on restart.
   - reopen: `-t "crash between"`
   - mutant: write the manifest before the rename without temp+rename → RED.
6. An existing single-file journal/index (fixture copied from today's format) reads and appends unchanged and seals at the cap.
   - reopen: `-t "existing single-file"`
   - mutant: n/a (migration).
7. `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 bun src/cli.ts audit semantic . --json` on the tip no longer reports SEM-STATE-8CF757A62803 or SEM-STATE-C6FB0796C5F5; removing the cap brings them back. Both outputs are recorded.
   - reopen: the command as named.
   - mutant: remove the cap → both findings return → RED.
8. Regression: run-receipt, second-pass, journal, evaluation-intake and control-plane tests (`test:bun`), skill-contract; `tsc --noEmit`; `charter check --strict`; `audit:public`; double clean build + `manifest:package:check`; full `pnpm run test:node` on the exact final bytes (S6).
   - reopen: the commands as named.
   - mutant: n/a (regression set).

Each proof: green, mutant RED, restore; recorded in reports/LANE-rotate-local-stores.md.
