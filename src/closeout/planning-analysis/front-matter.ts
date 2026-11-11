/**
 * The one front-matter parser of Mister Clean, shared by the planning policy
 * (policy.ts) and the semantic scan (semantic.ts). Pure; no imports.
 *
 * Grammar:
 * 1. Blank lines and whole `<!-- ... -->` comment lines (single- or multi-line) before the opener are skipped.
 * 2. A delimiter is a line that is exactly `---` after trimming all whitespace, U+FEFF included.
 * 3. The first later delimiter line closes the block; a block with no closer is no block.
 * 4. There is no `...` closer: a `...` line is block content. Lines split on LF or CRLF; a lone CR is not a break.
 */

/** The framed range: the opener line `start`, the closer line `end`, and the document split into `lines`. */
export interface FrontMatterRange {
  readonly end: number;
  readonly lines: string[];
  readonly start: number;
}

/** Locate the leading front-matter block of `content`, or undefined when there is none. */
export function frontMatterRange(content: string): FrontMatterRange | undefined {
  const lines = content.split(/\r?\n/);
  let start = 0;
  while (start < lines.length) {
    while (lines[start]?.trim() === "") start += 1;
    if (lines[start]?.trim().startsWith("<!--")) {
      while (start < lines.length && !lines[start]?.includes("-->")) start += 1;
      if (start < lines.length) start += 1;
      continue;
    }
    break;
  }
  if (lines[start]?.trim() !== "---") return undefined;
  for (let end = start + 1; end < lines.length; end += 1) {
    if (lines[end]?.trim() === "---") return { end, lines, start };
  }
  return undefined;
}

/** The text between the delimiters, joined with LF, or undefined when there is no block. */
export function frontMatterBlock(content: string): string | undefined {
  const range = frontMatterRange(content);
  return range ? range.lines.slice(range.start + 1, range.end).join("\n") : undefined;
}
