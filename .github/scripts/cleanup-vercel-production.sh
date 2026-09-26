#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <current-deployment-url> <vercel-project-id>" >&2
  exit 64
fi

: "${VERCEL_TOKEN:?VERCEL_TOKEN is required}"

CURRENT_URL="$1"
PROJECT_ID="$2"
CURRENT_HOST="${CURRENT_URL#https://}"
CURRENT_HOST="${CURRENT_HOST#http://}"
CURRENT_HOST="${CURRENT_HOST%%/*}"

TEAM_QUERY=""
if [[ "${VERCEL_ORG_ID:-}" == team_* ]]; then
  TEAM_QUERY="&teamId=${VERCEL_ORG_ID}"
fi

LIST_URL="https://api.vercel.com/v6/deployments?projectId=${PROJECT_ID}&target=production&limit=100${TEAM_QUERY}"
DEPLOYMENTS_JSON="$(curl --fail --silent --show-error \
  --header "Authorization: Bearer ${VERCEL_TOKEN}" \
  "${LIST_URL}")"

if ! jq -e --arg current "${CURRENT_HOST}" '.deployments[] | select(.url == $current)' \
  >/dev/null <<<"${DEPLOYMENTS_JSON}"; then
  echo "Refusing cleanup: newly verified deployment ${CURRENT_HOST} was not found in Vercel's production deployment list." >&2
  exit 1
fi

mapfile -t OLD_IDS < <(
  jq -r --arg current "${CURRENT_HOST}" \
    '.deployments[] | select(.target == "production" and .url != $current) | .uid' \
    <<<"${DEPLOYMENTS_JSON}"
)

if [[ ${#OLD_IDS[@]} -eq 0 ]]; then
  echo "No superseded production deployments to delete for ${PROJECT_ID}."
  exit 0
fi

for deployment_id in "${OLD_IDS[@]}"; do
  DELETE_URL="https://api.vercel.com/v13/deployments/${deployment_id}"
  if [[ -n "${TEAM_QUERY}" ]]; then
    DELETE_URL="${DELETE_URL}?teamId=${VERCEL_ORG_ID}"
  fi

  echo "Deleting superseded production deployment ${deployment_id}"
  curl --fail --silent --show-error \
    --request DELETE \
    --header "Authorization: Bearer ${VERCEL_TOKEN}" \
    "${DELETE_URL}" >/dev/null
done

echo "Removed ${#OLD_IDS[@]} superseded production deployment(s). Current deployment retained: ${CURRENT_HOST}"
