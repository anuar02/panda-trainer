#!/usr/bin/env python3
"""Local status dashboard for the Codex agent runner.

Reads only local state: docker, the runner logs, the queue worktree and the
bare mirror kept fresh by supervisor.sh. No GitHub token is needed.
Run: python3 tools/codex-agents/dashboard/server.py  ->  http://localhost:8787
"""
import json
import os
import re
import subprocess
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
AGENTS = HERE.parent
LOGS = AGENTS / "docker" / "logs"
TASKS = AGENTS / "tasks"
MIRROR = Path(os.environ.get("MIRROR", Path.home() / ".cache/panda-agent/mirror.git"))
BASE = os.environ.get("BASE_BRANCH", "fix/som-50-template-picker")
REPO_URL = "https://github.com/anuar02/panda-trainer"
MAX_TASKS = int(os.environ.get("MAX_TASKS", "1000"))
PORT = int(os.environ.get("PORT", "8787"))

EVENT = re.compile(r"^(START|OK|FAIL)\s+(\S+ \S+) (\S+) (\S+)")
PR = re.compile(re.escape(REPO_URL) + r"/pull/(\d+)")


def run(*cmd, timeout=10):
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return out.stdout if out.returncode == 0 else ""
    except (OSError, subprocess.TimeoutExpired):
        return ""


def parse_time(text):
    return datetime.strptime(text, "%Y-%m-%d %H:%M:%S").timestamp()


def read_events():
    events = []
    path = LOGS / "summary.txt"
    if not path.exists():
        return events
    for line in path.read_text(errors="replace").splitlines():
        m = EVENT.match(line)
        if m:
            kind, stamp, account, name = m.groups()
            events.append({"kind": kind, "time": parse_time(stamp), "account": account, "name": name})
    return events


_stats_cache = {"at": 0.0, "data": {}}


def containers():
    names = {}
    for line in run("docker", "ps", "--filter", "name=agent-", "--format", "{{.Names}}\t{{.RunningFor}}").splitlines():
        name, _, running_for = line.partition("\t")
        names[name] = {"running_for": running_for}
    if time.time() - _stats_cache["at"] > 15:
        stats = {}
        for line in run("docker", "stats", "--no-stream", "--format", "{{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}", timeout=20).splitlines():
            name, mem, cpu = (line.split("\t") + ["", ""])[:3]
            stats[name] = {"mem": mem.split(" / ")[0], "cpu": cpu}
        _stats_cache.update(at=time.time(), data=stats)
    for name, info in names.items():
        info.update(_stats_cache["data"].get(name, {}))
    return names


def clean_tail(text):
    keep = []
    for line in text.splitlines():
        if line.startswith(("Everything up-to-date", "branch '", "To https", "remote:", "Branch ")):
            break
        keep.append(line)
    return "\n".join(keep).strip()


def read_log(path):
    if not path.exists():
        return {}
    text = path.read_text(errors="replace").replace("\r", "\n")
    info = {"lines": text.count("\n")}
    tail = text[text.rfind("\ntokens used\n"):] if "\ntokens used\n" in text else ""
    prs = PR.findall(tail) or (PR.findall(text)[-1:] if tail else [])
    if prs:
        info["pr"] = int(prs[0])
    notes = list(re.finditer(r"\ncodex\n", text))
    if notes:
        chunk = text[notes[-1].end():]
        info["latest"] = clean_tail(re.split(r"\n(?:exec|codex|tokens used)\n", chunk)[0])[:2500]
    elif "Cloning into" in text:
        info["latest"] = "Preparing: cloning and installing dependencies"
    used = list(re.finditer(r"\ntokens used\n([\d,]+)\n", text))
    if used:
        info["tokens"] = used[-1].group(1)
        info["final"] = clean_tail(text[used[-1].end():])[:2500] or info.get("latest", "")
    return info


def title_of(path):
    for line in path.read_text(errors="replace").splitlines():
        if line.strip():
            return line.lstrip("# ").strip()
    return path.stem


def merged_commits():
    out = run("git", "--git-dir", str(MIRROR), "log", BASE, "-10", "--format=%h\t%ct\t%s")
    commits = []
    for line in out.splitlines():
        sha, ct, subject = line.split("\t", 2)
        m = re.search(r"\(#(\d+)\)\s*$", subject)
        commits.append({"sha": sha, "time": int(ct), "subject": subject, "pr": int(m.group(1)) if m else None})
    return commits


def linear():
    path = AGENTS / "linear-status.json"
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None


def status():
    now = time.time()
    events = read_events()
    running = containers()
    merged = merged_commits()
    merged_prs = {c["pr"] for c in merged if c["pr"]}

    briefs = {}
    for folder in sorted(TASKS.iterdir()) if TASKS.exists() else []:
        if not folder.is_dir():
            continue
        for path in sorted(folder.glob("*.md")):
            briefs[path.stem] = {"account": None if folder.name == "done" else folder.name,
                                 "done_folder": folder.name == "done", "title": title_of(path)}

    by_name = {}
    for e in events:
        if e["name"] == "coordinator":
            continue
        by_name.setdefault(e["name"], []).append(e)
        briefs.setdefault(e["name"], {"account": e["account"], "done_folder": False, "title": e["name"]})

    tasks = []
    for name, brief in briefs.items():
        evs = by_name.get(name, [])
        start = next((e for e in reversed(evs) if e["kind"] == "START"), None)
        end = next((e for e in reversed(evs) if e["kind"] in ("OK", "FAIL")), None)
        if end and start and end["time"] < start["time"]:
            end = None
        log = read_log(LOGS / f"{name}.log")
        cont = running.get(f"agent-{name}")
        pr = log.get("pr")
        if cont:
            state = "running"
        elif pr and pr in merged_prs:
            state = "merged"
        elif brief["done_folder"]:
            state = "closed"
        elif end and end["kind"] == "OK":
            state = "review"
        elif end:
            state = "failed"
        elif start:
            state = "interrupted"
        else:
            state = "queued"
        account = brief["account"] or (evs[-1]["account"] if evs else "")
        tasks.append({
            "name": name, "title": brief["title"], "account": account, "state": state,
            "started": start["time"] if start else None,
            "duration": ((end["time"] if end else now) - start["time"]) if start else None,
            "pr": pr, "tokens": log.get("tokens"),
            "text": log.get("final") or log.get("latest") or "",
            "container": cont,
        })
    order = {"running": 0, "review": 1, "queued": 2, "failed": 3, "interrupted": 4, "merged": 5, "closed": 6}
    tasks.sort(key=lambda t: (order[t["state"]], -(t["started"] or now)))

    coord_runs = []
    coord_events = [e for e in events if e["name"] == "coordinator"]
    logs = sorted(LOGS.glob("coordinator-*.log"))
    starts = [e for e in coord_events if e["kind"] == "START"]
    ends = [e for e in coord_events if e["kind"] != "START"]
    for i, s in enumerate(starts):
        end = next((e for e in ends if e["time"] >= s["time"]), None)
        if end:
            ends.remove(end)
        log = read_log(logs[i]) if i < len(logs) else {}
        coord_runs.append({"started": s["time"], "state": "running" if not end else end["kind"].lower(),
                           "duration": (end["time"] if end else now) - s["time"],
                           "text": log.get("final") or log.get("latest") or "", "tokens": log.get("tokens")})
    if coord_runs and coord_runs[-1]["state"] == "running" and "agent-coordinator" not in running:
        coord_runs[-1]["state"] = "interrupted"
    coord_runs.reverse()

    sup_log = (LOGS / "supervisor.txt").read_text(errors="replace").splitlines()[-12:] if (LOGS / "supervisor.txt").exists() else []
    done = sum(1 for e in events if e["kind"] == "OK" and e["name"] != "coordinator")
    stop = AGENTS / "STOP"
    clog = AGENTS / "COORDINATOR-LOG.md"
    return {
        "now": now, "base": BASE, "repo": REPO_URL, "max": MAX_TASKS, "done": done, "linear": linear(),
        "supervisor": bool(run("pgrep", "-f", "supervisor-running.sh")),
        "stop": stop.read_text(errors="replace") if stop.exists() else None,
        "tasks": tasks, "coordinator": coord_runs[:8], "merged": merged,
        "coordinator_log": clog.read_text(errors="replace")[-6000:] if clog.exists() else "",
        "supervisor_log": sup_log,
    }


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/api/status"):
            body = json.dumps(status()).encode()
            kind = "application/json"
        elif self.path in ("/", "/index.html"):
            body = (HERE / "index.html").read_bytes()
            kind = "text/html; charset=utf-8"
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"Agent dashboard on http://localhost:{PORT}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
