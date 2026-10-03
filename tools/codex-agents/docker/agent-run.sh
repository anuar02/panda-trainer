#!/usr/bin/env bash
set -euo pipefail
: "${GH_TOKEN:?GH_TOKEN is required}"
: "${TASK_NAME:?TASK_NAME is required}"
: "${ACCOUNT:?ACCOUNT is required}"

repo_url="https://github.com/${REPO:-anuar02/panda-trainer}.git"
branch="agent/$TASK_NAME"
base="${BASE_BRANCH:-main}"

gh auth setup-git
git config --global user.name "codex-agent ($ACCOUNT)"
git config --global user.email "codex-agent@users.noreply.github.com"

if git ls-remote --exit-code --heads "$repo_url" "$branch" >/dev/null 2>&1; then
  echo "Branch $branch already exists on origin, skipping"
  exit 0
fi

git clone --reference-if-able /mirror --branch "$base" "$repo_url" repo
cd repo
git checkout -b "$branch"
(cd app && npm ci --no-audit --no-fund)

prompt="$(cat /task/task.md)

$(sed -e "s|{{BRANCH}}|$branch|g" -e "s|{{BASE}}|$base|g" /task/RULES.md)"

if [ -f /task/SUBAGENTS.md ]; then
  prompt="$prompt

$(cat /task/SUBAGENTS.md)"
fi

status=0
codex exec --dangerously-bypass-approvals-and-sandbox "$prompt" || status=$?

if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "WIP $TASK_NAME: auto-commit of uncommitted agent changes"
fi

if [ "$(git rev-list --count origin/$base..HEAD)" -gt 0 ]; then
  git push -u origin "$branch"
  gh pr view "$branch" >/dev/null 2>&1 \
    || gh pr create --base "$base" --head "$branch" --draft --fill
fi

exit "$status"
