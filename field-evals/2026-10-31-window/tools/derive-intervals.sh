#!/usr/bin/env bash
# Per-5-minute-interval counter deltas for Pi-style seats (cumulative "up/down" token counters).
# Input: same meter TSV as derive-meter.sh. Output: TSV to stdout.
# A model-label change between two samples marks the interval as "switch" (the delta spans
# two routes and must not be attributed to either).
# Counters are printed rounded by the harness (k / M suffix), so deltas under ~1k are noise
# and a delta can read 0 while work happened inside the rounding step.
set -euo pipefail
[ $# -eq 1 ] || { echo "usage: $0 <meter.tsv>" >&2; exit 2; }
LC_ALL=C awk -F'\t' '
function num(s,   v, u) {
  if (match(s, /^[0-9.]+/) == 0) return -1
  v = substr(s, RSTART, RLENGTH) + 0
  u = substr(s, RSTART + RLENGTH, 1)
  if (u == "k" || u == "K") v *= 1e3
  else if (u == "M") v *= 1e6
  return v
}
BEGIN { print "utc\tseat\tmodel_label\tinterval\tdelta_in\tdelta_out" }
NR == 1 { next }
{
  f = $5; gsub(/[^ -~]/, " ", f)
  if (!match(f, /^ *[0-9.]+[kKM]? +[0-9.]+[kKM]? *$/)) next
  split(f, p, " "); a = num(p[1]); b = num(p[2])
  s = $3
  if (s in pa) {
    printf "%s\t%s\t%s\t%s\t%d\t%d\n", $1, s, $4, ($4 == pm[s] ? "same-route" : "switch"), a - pa[s], b - pb[s]
  }
  pa[s] = a; pb[s] = b; pm[s] = $4
}' "$1"
