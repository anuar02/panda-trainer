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

[ "$status" -eq 0 ] || exit "$status"
[ "$(git rev-list --count origin/$base..HEAD)" -gt 0 ] || exit 0
[ "${AUTO_MERGE:-1}" = 1 ] || exit 0

repo_slug="${REPO:-anuar02/panda-trainer}"

ci_state() {
  local sha=$1 waited=0 runs pending failed
  while [ $waited -lt 2700 ]; do
    runs=$(gh api "repos/$repo_slug/commits/$sha/check-runs" --jq '.check_runs | length' 2>/dev/null || echo 0)
    if [ "$runs" -eq 0 ]; then
      if [ $waited -ge 300 ]; then echo none; return; fi
    else
      pending=$(gh api "repos/$repo_slug/commits/$sha/check-runs" --jq '[.check_runs[] | select(.status != "completed")] | length' 2>/dev/null || echo 1)
      if [ "$pending" -eq 0 ]; then
        failed=$(gh api "repos/$repo_slug/commits/$sha/check-runs" --jq '[.check_runs[] | select(.conclusion != "success" and .conclusion != "skipped" and .conclusion != "neutral")] | length')
        if [ "$failed" -eq 0 ]; then echo green; else echo red; fi
        return
      fi
    fi
    sleep 30
    waited=$((waited + 30))
  done
  echo timeout
}

if git diff --name-only --diff-filter=MDR "origin/$base...HEAD" -- supabase/migrations | grep -q .; then
  gh pr edit "$branch" --add-label needs-local-db >/dev/null 2>&1 || true
  echo "AUTO-MERGE: existing migrations changed, PR left for review"
  exit 0
fi

attempt=0
while [ $attempt -lt 3 ]; do
  attempt=$((attempt + 1))
  git fetch -q origin "$base"
  if ! git merge -q --no-edit "origin/$base"; then
    git merge --abort || true
    echo "AUTO-MERGE: conflict with $base, PR left for coordinator"
    exit 0
  fi
  git push -q origin "$branch"
  gh pr ready "$branch" >/dev/null 2>&1 || true
  sha=$(git rev-parse HEAD)
  state=$(ci_state "$sha")
  echo "AUTO-MERGE: attempt $attempt CI $state at $sha"
  if [ "$state" = none ]; then
    if git diff --name-only "origin/$base...HEAD" | grep -qE '^(app/|supabase/|\.github/)'; then
      echo "AUTO-MERGE: no CI run for code changes, PR left for coordinator"
      exit 0
    fi
    state=green
  fi
  if [ "$state" = green ]; then
    if gh pr merge "$branch" --squash; then
      echo "AUTO-MERGE: merged"
    else
      echo "AUTO-MERGE: merge refused, PR left for coordinator"
    fi
    exit 0
  fi
  if [ "$state" != red ]; then
    echo "AUTO-MERGE: CI $state, PR left for coordinator"
    exit 0
  fi
  [ $attempt -lt 3 ] || break
  run_id=$(gh run list --branch "$branch" --commit "$sha" --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)
  ci_log="CI log unavailable"
  [ -n "$run_id" ] && ci_log=$(gh run view "$run_id" --log-failed 2>/dev/null | tail -250 || echo "CI log unavailable")
  fix_prompt="$(cat /task/task.md)

$(sed -e "s|{{BRANCH}}|$branch|g" -e "s|{{BASE}}|$base|g" /task/RULES.md)

## CI на PR красный — почини

Задача выше уже выполнена в этой ветке, PR открыт. GitHub CI упал (попытка $attempt из 3).
Исправь причину, не ослабляя тесты и не меняя существующие migrations. Если упал
db:types:check — обнови app/src/lib/database.types.ts по новым SQL-объектам вручную
точно в формате генератора. Закоммить и запушь в $branch. Новый PR не создавай.
Хвост лога CI:

$ci_log"
  codex exec --dangerously-bypass-approvals-and-sandbox "$fix_prompt" || true
  if [ -n "$(git status --porcelain)" ]; then
    git add -A
    git commit -q -m "WIP $TASK_NAME: auto-commit of CI fix"
  fi
done

echo "AUTO-MERGE: CI still red after $attempt attempts, PR left for coordinator"
exit 0
