#!/usr/bin/env bash
set -uo pipefail

here=$(cd "$(dirname "$0")" && pwd)
briefs=$(cd "$here/.." && pwd)
logs="$here/logs"
: "${GH_TOKEN:?export GH_TOKEN with a fine-grained token for anuar02/panda-trainer}"

[ $# -eq 0 ] && set -- work personal third
mkdir -p "$logs"
docker build -q -t panda-agent "$here" >/dev/null || exit 1

run_queue() {
  local acc=$1 task name
  for task in "$briefs/tasks/$acc"/*.md; do
    [ -e "$task" ] || continue
    name=$(basename "$task" .md)
    echo "START $(date '+%F %T') $acc $name" >> "$logs/summary.txt"
    if docker run --rm --name "agent-$name" \
        -e GH_TOKEN -e BASE_BRANCH="${BASE_BRANCH:-main}" -e TASK_NAME="$name" -e ACCOUNT="$acc" \
        -v "$HOME/.codex-$acc:/home/node/.codex" \
        -v "$task:/task/task.md:ro" \
        -v "$briefs/RULES.md:/task/RULES.md:ro" \
        -v panda-agent-npm:/home/node/.npm \
        --memory 6g --cpus 2 \
        panda-agent > "$logs/$name.log" 2>&1; then
      echo "OK    $(date '+%F %T') $acc $name" >> "$logs/summary.txt"
    else
      echo "FAIL  $(date '+%F %T') $acc $name (logs/$name.log)" >> "$logs/summary.txt"
    fi
  done
}

for acc in "$@"; do
  run_queue "$acc" &
done
wait
echo "ALL DONE $(date '+%F %T')" >> "$logs/summary.txt"
