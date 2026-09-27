#!/usr/bin/env bash
# Vercel Ignored Build Step helper for Averis monorepo projects.
# Exit 0 => skip deployment. Exit 1 => continue with a real build.

set -u

scope="${1:-.}"
current_sha="${VERCEL_GIT_COMMIT_SHA:-HEAD}"
previous_sha="${VERCEL_GIT_PREVIOUS_SHA:-}"

# No previous successful deployment means we must build.
if [[ -z "$previous_sha" ]]; then
  exit 1
fi

# A stale last-successful SHA may not exist in the checkout. Never let that
# become a deployment error: build instead so production can catch up.
if ! git cat-file -e "${previous_sha}^{commit}" 2>/dev/null; then
  exit 1
fi

# Fall back to checked-out HEAD if the provided current SHA is unavailable.
if ! git cat-file -e "${current_sha}^{commit}" 2>/dev/null; then
  current_sha="HEAD"
fi

# git diff --quiet: 0 = no scoped changes (skip), 1 = changes (build).
# Any other git error also fails open to a build rather than failing Vercel.
git diff --quiet "$previous_sha" "$current_sha" -- "$scope"
result=$?

if [[ $result -eq 0 ]]; then
  exit 0
fi

exit 1
