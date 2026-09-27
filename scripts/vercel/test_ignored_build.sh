#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
helper="$repo_root/scripts/vercel/ignored_build.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cd "$tmp"
git init -q
git config user.name "Averis CI"
git config user.email "ci@example.invalid"
mkdir -p apps/web services/api docs
printf 'web-v1\n' > apps/web/file.txt
printf 'api-v1\n' > services/api/file.txt
printf 'docs-v1\n' > docs/readme.md
git add .
git commit -qm initial
base_sha="$(git rev-parse HEAD)"

# Docs-only change: web and API should be skipped (exit 0).
printf 'docs-v2\n' > docs/readme.md
git add docs/readme.md
git commit -qm docs-only
current_sha="$(git rev-parse HEAD)"

(
  cd apps/web
  VERCEL_GIT_PREVIOUS_SHA="$base_sha" VERCEL_GIT_COMMIT_SHA="$current_sha" bash "$helper" .
)
(
  cd services/api
  VERCEL_GIT_PREVIOUS_SHA="$base_sha" VERCEL_GIT_COMMIT_SHA="$current_sha" bash "$helper" .
)

# Web change: web must build (exit 1).
printf 'web-v2\n' > apps/web/file.txt
git add apps/web/file.txt
git commit -qm web-change
web_sha="$(git rev-parse HEAD)"
if (
  cd apps/web
  VERCEL_GIT_PREVIOUS_SHA="$current_sha" VERCEL_GIT_COMMIT_SHA="$web_sha" bash "$helper" .
); then
  echo "Expected web change to request a build." >&2
  exit 1
fi

# Missing previous SHA: must build instead of returning a Vercel-breaking git error.
if (
  cd apps/web
  VERCEL_GIT_PREVIOUS_SHA="0000000000000000000000000000000000000000" VERCEL_GIT_COMMIT_SHA="$web_sha" bash "$helper" .
); then
  echo "Expected missing previous SHA to fail open to a build." >&2
  exit 1
fi

echo "Vercel ignored-build fallback tests passed."
