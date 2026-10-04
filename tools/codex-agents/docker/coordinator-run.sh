#!/usr/bin/env bash
set -euo pipefail
: "${GH_TOKEN:?GH_TOKEN is required}"
: "${BASE_BRANCH:?BASE_BRANCH is required}"
: "${QUEUE_BRANCH:?QUEUE_BRANCH is required}"

if [ "$BASE_BRANCH" = main ]; then
  echo "BASE_BRANCH must not be main"
  exit 1
fi

repo_url="https://github.com/${REPO:-anuar02/panda-trainer}.git"

gh auth setup-git
git config --global user.name "codex-coordinator"
git config --global user.email "codex-agent@users.noreply.github.com"

mkdir -p work
cd work
git clone --reference-if-able /mirror --branch "$BASE_BRANCH" "$repo_url" repo
git clone --reference-if-able /mirror --branch "$QUEUE_BRANCH" "$repo_url" queue
(cd repo/app && npm ci --no-audit --no-fund)

prompt="$(sed -e "s|{{BASE}}|$BASE_BRANCH|g" \
  -e "s|{{QUEUE}}|$QUEUE_BRANCH|g" \
  -e "s|{{DONE}}|${DONE_COUNT:-0}|g" \
  -e "s|{{MAX}}|${MAX_TASKS:-1000}|g" \
  -e "s|{{FINAL}}|${FINAL:-0}|g" \
  -e "s|{{WORKERS}}|${WORKERS:-work personal}|g" \
  /task/COORDINATOR.md)"

status=0
timeout "${COORDINATOR_TIMEOUT:-1200}" codex exec --dangerously-bypass-approvals-and-sandbox "$prompt" || status=$?

cd queue
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "coordinator: auto-commit of uncommitted queue changes"
fi
git pull --rebase -q origin "$QUEUE_BRANCH" || true
git push origin "HEAD:$QUEUE_BRANCH" || status=1

exit "$status"
