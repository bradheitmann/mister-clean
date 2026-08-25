/**
 * Unicode-aware caseless matching without a runtime dependency.
 *
 * NFKC expands compatibility forms and the upper/lower round trip applies
 * multi-code-point mappings such as German sharp-s -> SS -> ss. This is
 * deliberately stronger than locale-lowercasing for identity and denylist
 * comparisons, where a false distinction is the dangerous outcome.
 */
export function foldCase(value: string): string {
  let folded = value.normalize("NFKC");
  for (;;) {
    const next = folded.toLocaleUpperCase("und").toLocaleLowerCase("und");
    if (next === folded) return next;
    folded = next;
  }
}

export function canonicalIdentity(value: unknown): string {
  if (value === undefined || value === null) return "";
  return foldCase(String(value).trim().split(/\s+/u).join(" "));
}
