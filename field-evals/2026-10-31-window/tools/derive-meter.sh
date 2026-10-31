#!/usr/bin/env bash
# Derive per-seat summary rows from a pane-sample meter file.
# Input: TSV with header  utc surface title model footer banner  (5-minute samples)
# Output: TSV, one row per seat, to stdout.
# Footer shapes understood: Pi "up<N> down<N>" cumulative token counters;
#   OpenCode "<N>K (<P>%)" context size. Anything else is passed through as n/a.
# Banner hits are reported raw and "candidate": candidate excludes matches that are
# only instruction text echoed in scrollback (template markers below).
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
NR == 1 { next }
{
  seat = $3; if (seat == "") seat = $2
  n[seat]++
  if (!(seat in first)) first[seat] = $1
  last[seat] = $1
  lab = $4
  gsub(/[0-9.]+[kK] \([0-9]+%\)/, "", lab); gsub(/ · ctrl\+p menu/, "", lab); gsub(/ · \$[0-9.]+/, "", lab); gsub(/ • paper Connected/, "", lab)
  gsub(/ +· +·/, " ·", lab); gsub(/  +/, " ", lab); gsub(/ +$/, "", lab)
  if (lab != "" && !((lab, seat) in seen)) { seen[lab, seat] = 1; nm[seat]++; models[seat] = models[seat] (models[seat] == "" ? "" : " ;; ") lab }
  f = $5; gsub(/[^ -~]/, " ", f)
  kind = "na"; a = -1; b = -1
  if (match(f, /^ *[0-9.]+[kKM]? +[0-9.]+[kKM]? *$/)) {
    split(f, p, " "); a = num(p[1]); b = num(p[2]); kind = "pi"
  } else if (match(f, /^ *[0-9.]+[kK] *\(/)) {
    a = num(f); kind = "oc"
  }
  if (kind != "na") {
    if (!(seat in k0)) { k0[seat] = kind; a0[seat] = a; b0[seat] = b }
    a1[seat] = a; b1[seat] = b; k1[seat] = kind
  }
  if ($5 == prev[seat] && $5 != "") run[seat]++; else run[seat] = 1
  prev[seat] = $5
  if (run[seat] > maxrun[seat]) maxrun[seat] = run[seat]
  if ($6 != "") {
    raw[seat]++
    t = $6
    if (t !~ /banner=|<banner>|Rate-limit banner:|grep -|[a-z)]\|[a-z(]/ && t ~ /429|[Rr]ate.?limit (reached|exceeded)|usage limit|[Qq]uota|[Tt]oo many requests|insufficient (credit|balance)/) cand[seat]++
  }
}
END {
  print "seat\tsamples\tfirst_utc\tlast_utc\tdistinct_model_labels\tcounter_kind\tstart\tend\tdelta_in\tdelta_out\tmax_flat_run\tbanner_raw\tbanner_candidate\tmodel_labels"
  for (s in n) {
    printf "%s\t%d\t%s\t%s\t%d\t%s\t%s\t%s\t%s\t%s\t%d\t%d\t%d\t%s\n", s, n[s], first[s], last[s], nm[s], \
      (s in k0 ? k0[s] : "na"), (s in a0 ? a0[s] : "na"), (s in a1 ? a1[s] : "na"), \
      (k1[s] == "pi" ? a1[s] - a0[s] : "na"), (k1[s] == "pi" ? b1[s] - b0[s] : "na"), \
      maxrun[s], raw[s] + 0, cand[s] + 0, models[s]
  }
}' "$1" | { IFS= read -r h; printf '%s\n' "$h"; sort; }
