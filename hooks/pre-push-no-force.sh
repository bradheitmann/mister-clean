#!/bin/sh
# Refuses any push that would move a remote ref to a commit that does not
# contain the remote's current tip (a force update / history rewrite).
# Deletions and new refs pass; branch deletion is governed by the archive-tag
# rule in AGENTS.md, not here. Reads git's pre-push stdin:
#   <local ref> <local sha> <remote ref> <remote sha>
# Install (chained by the charter hook): cp hooks/pre-push-no-force.sh .git/hooks/pre-push.charter-backup
zero=0000000000000000000000000000000000000000
status=0
while read -r local_ref local_sha remote_ref remote_sha; do
  [ -z "$local_ref" ] && continue
  case "$local_sha" in "$zero"|"") continue ;; esac   # deletion
  case "$remote_sha" in "$zero"|"") continue ;; esac  # new ref
  if ! git cat-file -e "$remote_sha^{commit}" 2>/dev/null; then
    echo "pre-push-no-force: refusing $remote_ref: remote tip $remote_sha is not in the local object store; fetch first" >&2
    status=1
  elif ! git merge-base --is-ancestor "$remote_sha" "$local_sha"; then
    echo "pre-push-no-force: refusing $remote_ref: $remote_sha -> $local_sha is not a fast-forward (would rewrite pushed history; merge instead of rebasing a pushed branch)" >&2
    status=1
  fi
done
exit $status
