#!/usr/bin/env bash
set -uo pipefail
: "${GH_TOKEN:?export GH_TOKEN first}"
: "${BASE_BRANCH:=fix/som-50-template-picker}"
export GH_TOKEN BASE_BRANCH

here=$(cd "$(dirname "$0")" && pwd)
logs="$here/logs"

for pid in $(pgrep -f supervisor-running.sh); do
  parent=$(ps -o ppid= -p "$pid" | tr -d ' ')
  if ! ps -o command= -p "$parent" | grep -q supervisor-running.sh; then
    kill "$pid" && echo "stopped supervisor loop $pid"
  fi
done
sleep 2

nohup "$here/supervisor.sh" > "$logs/supervisor.out" 2>&1 &
disown
sleep 3
echo "started supervisor loop $(cat "$logs/supervisor.pid" 2>/dev/null)"
