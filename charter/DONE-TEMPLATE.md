# Done list — <slice id> (written BEFORE dispatch; does not grow during it)
Base bytes: <commit/patch hash>
Proofs (each: name, what it guarantees, reopen step, fail-without mutant):
1.
2.
Rules for every proof (each from a recorded miss):
- Number every proof with a whole number. `charter reopen` reads whole numbers only, so a proof "4a" cannot be reopened on its own.
- State one criterion per proof. A proof that allows a debt "if it recurs" and also says every gate passed has two.
- A reopen reads no file that another repository can rewrite. Write a pin as a literal commit in the proof.
- Say which shell a reopen runs under, and use the one hosted CI uses for that step.
- The regression set names the public-safety tree test: src/closeout/inspection.test.ts, "keeps the prospective public source tree free of private identifiers".
Gates (exact commands):
-
Out of scope (recorded obligations, not fixed here):
-
Owner decision points:
-
