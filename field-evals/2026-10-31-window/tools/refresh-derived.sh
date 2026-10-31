#!/usr/bin/env bash
# Regenerate the derived meter tables in ../data from a raw meter file.
# The raw meter file is NOT committed (it carries source-project text in pane scrollback).
# Team prefixes ("B/", "R/") are stripped from seat names. Optional: SEAT_MAP_SED=<file> is a
# private sed script that renames seats; it lives outside the repository.
set -euo pipefail
[ $# -eq 1 ] || { echo "usage: $0 <raw-meter.tsv>" >&2; exit 2; }
here="$(cd "$(dirname "$0")" && pwd)"
tab="$(printf '\t')"
anon() {
  { if [ -n "${SEAT_MAP_SED:-}" ]; then sed -f "$SEAT_MAP_SED"; else cat; fi; } | sed -E "s#(^|${tab})[A-Z]/#\\1#"
}
"$here/derive-meter.sh" "$1" | anon > "$here/../data/meter-summary.tsv"
"$here/derive-intervals.sh" "$1" | anon > "$here/../data/meter-intervals.tsv"
echo "samples: $(($(wc -l < "$1") - 1))  first: $(sed -n 2p "$1" | cut -f1)  last: $(tail -1 "$1" | cut -f1)"
