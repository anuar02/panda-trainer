#!/usr/bin/env bash
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
logs="$here/logs"
pid=$(cat "$logs/supervisor.pid" 2>/dev/null)

if [ "${1:-}" = "--reload" ]; then
  [ -n "$pid" ] && kill -HUP "$pid" && echo "asked supervisor $pid to reload" && exit 0
  echo "no running supervisor"; exit 1
fi

: "${GH_TOKEN:?export GH_TOKEN first, or use --reload to keep the running token}"
: "${BASE_BRANCH:=fix/som-50-template-picker}"
export GH_TOKEN BASE_BRANCH

if [ -n "$pid" ] && ps -o command= -p "$pid" | grep -q supervisor-running.sh; then
  kill "$pid" && echo "stopped supervisor loop $pid"
  sleep 2
fi

nohup "$here/supervisor.sh" > "$logs/supervisor.out" 2>&1 &
disown
sleep 3
echo "started supervisor loop $(cat "$logs/supervisor.pid" 2>/dev/null)"
