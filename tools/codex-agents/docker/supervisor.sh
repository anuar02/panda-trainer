#!/usr/bin/env bash
set -uo pipefail

here=$(cd "$(dirname "$0")" && pwd)
briefs=$(cd "$here/.." && pwd)
root=$(git -C "$here" rev-parse --show-toplevel)
logs="$here/logs"
summary="$logs/summary.txt"
: "${GH_TOKEN:?export GH_TOKEN with a fine-grained token for anuar02/panda-trainer}"
: "${BASE_BRANCH:?export BASE_BRANCH, the branch agents start from and merge into}"
if [ "$BASE_BRANCH" = main ]; then
  echo "BASE_BRANCH must not be main"
  exit 1
fi
export GH_TOKEN BASE_BRANCH

queue_branch=$(git -C "$root" branch --show-current)
max_tasks=${MAX_TASKS:-12}
workers=${WORKERS:-work personal}
coordinator=${COORDINATOR:-third}
interval=${COORDINATOR_INTERVAL:-1200}
poll=${POLL_SECONDS:-60}
worker_pattern=$(echo $workers | tr ' ' '|')

mkdir -p "$logs"
touch "$summary"
note() { echo "$(date '+%F %T') $*" >> "$logs/supervisor.txt"; }

docker build -q -t panda-agent "$here" >/dev/null || exit 1

container_running() { docker ps --format '{{.Names}}' | grep -qx "$1"; }

account_busy() {
  local acc=$1 name
  [ -n "$(docker ps -q --filter "label=panda.account=$acc")" ] && return 0
  for name in $(docker ps --format '{{.Names}}' | sed -n 's/^agent-//p'); do
    [ -e "$briefs/tasks/$acc/$name.md" ] && return 0
  done
  return 1
}

already_ran() { grep -qE "^(OK|FAIL) +[^ ]+ [^ ]+ [^ ]+ $1( |$)" "$summary"; }

branch_exists() { git -C "$root" ls-remote --exit-code --heads origin "agent/$1" >/dev/null 2>&1; }

next_task() {
  local acc=$1 f name
  for f in "$briefs/tasks/$acc"/*.md; do
    [ -e "$f" ] || continue
    name=$(basename "$f" .md)
    already_ran "$name" && continue
    container_running "agent-$name" && continue
    branch_exists "$name" && continue
    echo "$f"
    return 0
  done
  return 1
}

done_count() { grep -cE "^OK +[^ ]+ [^ ]+ ($worker_pattern) " "$summary"; }
finished_count() { grep -cE "^(OK|FAIL) +[^ ]+ [^ ]+ ($worker_pattern) " "$summary"; }

launch_worker() {
  local acc=$1 task=$2 name
  name=$(basename "$task" .md)
  echo "START $(date '+%F %T') $acc $name" >> "$summary"
  note "start worker $acc $name"
  (
    if docker run --rm --name "agent-$name" --label "panda.account=$acc" \
        -e GH_TOKEN -e BASE_BRANCH -e TASK_NAME="$name" -e ACCOUNT="$acc" \
        -v "$HOME/.codex-$acc:/home/node/.codex" \
        -v "$task:/task/task.md:ro" \
        -v "$briefs/RULES.md:/task/RULES.md:ro" \
        -v panda-agent-npm:/home/node/.npm \
        --memory 5g --cpus 2 \
        panda-agent > "$logs/$name.log" 2>&1; then
      echo "OK    $(date '+%F %T') $acc $name" >> "$summary"
    else
      echo "FAIL  $(date '+%F %T') $acc $name (logs/$name.log)" >> "$summary"
    fi
  ) &
}

launch_coordinator() {
  local final=$1 stamp
  stamp=$(date '+%Y%m%d-%H%M%S')
  echo "START $(date '+%F %T') $coordinator coordinator" >> "$summary"
  note "start coordinator final=$final done=$(done_count)"
  (
    if docker run --rm --name agent-coordinator --label panda.role=coordinator \
        --entrypoint coordinator-run \
        -e GH_TOKEN -e BASE_BRANCH -e QUEUE_BRANCH="$queue_branch" \
        -e DONE_COUNT="$(done_count)" -e MAX_TASKS="$max_tasks" -e FINAL="$final" \
        -e WORKERS="$workers" \
        -v "$HOME/.codex-$coordinator:/home/node/.codex" \
        -v "$briefs/COORDINATOR.md:/task/COORDINATOR.md:ro" \
        -v "$summary:/task/summary.txt:ro" \
        -v panda-agent-npm:/home/node/.npm \
        --memory 4g --cpus 2 \
        panda-agent > "$logs/coordinator-$stamp.log" 2>&1; then
      echo "OK    $(date '+%F %T') $coordinator coordinator" >> "$summary"
    else
      echo "FAIL  $(date '+%F %T') $coordinator coordinator (logs/coordinator-$stamp.log)" >> "$summary"
    fi
  ) &
}

note "supervisor started: base=$BASE_BRANCH queue=$queue_branch workers=$workers coordinator=$coordinator max=$max_tasks"
last_coordinator=0
seen_finished=-1

while true; do
  git -C "$root" pull -q --ff-only origin "$queue_branch" || note "queue pull failed"
  finished=$(finished_count)
  limit_reached=0
  [ "$(done_count)" -ge "$max_tasks" ] && limit_reached=1
  stopped=0
  [ -e "$briefs/STOP" ] && stopped=1

  idle_without_task=0
  if [ $limit_reached -eq 0 ] && [ $stopped -eq 0 ]; then
    for acc in $workers; do
      account_busy "$acc" && continue
      if task=$(next_task "$acc"); then
        launch_worker "$acc" "$task"
      else
        idle_without_task=1
      fi
    done
  fi
  sleep 5

  workers_running=0
  for acc in $workers; do
    account_busy "$acc" && workers_running=1
  done

  if ! container_running agent-coordinator; then
    now=$(date +%s)
    if [ "$finished" -ne "$seen_finished" ]; then
      if [ $limit_reached -eq 0 ]; then
        launch_coordinator 0
        last_coordinator=$now
        seen_finished=$finished
      elif [ $workers_running -eq 0 ]; then
        launch_coordinator 1
        last_coordinator=$now
        seen_finished=$finished
      fi
    elif [ $workers_running -eq 0 ] && [ $limit_reached -eq 1 ]; then
      note "stopping: limit of $max_tasks tasks reached"
      break
    elif [ $workers_running -eq 0 ] && [ $stopped -eq 1 ]; then
      note "stopping: $(head -1 "$briefs/STOP")"
      break
    elif [ $limit_reached -eq 0 ] && [ $stopped -eq 0 ] && [ $idle_without_task -eq 1 ] \
        && [ $((now - last_coordinator)) -ge "$interval" ]; then
      launch_coordinator 0
      last_coordinator=$now
    fi
  fi
  sleep "$poll"
done

wait
echo "ALL DONE $(date '+%F %T') supervisor" >> "$summary"