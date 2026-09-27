import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stateDir, statePath } from "./config";
import { CliError, ExitCode } from "./errors";
import type { Kind } from "./endpoints";

export interface JobRecord {
  request_id: string;
  endpoint: string;
  kind: Kind;
  owner: string;
  dedupe_key: string;
  input: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
  status_url?: string;
  cancel_url?: string;
  media: string[];
  error?: string;
}

export interface Store {
  version: 1;
  requests: Record<string, JobRecord>;
  uploads: Record<string, { public_url: string; created_at: string }>;
}

const ACTIVE_STATUSES = new Set(["queued", "in_progress"]);

function emptyStore(): Store {
  return { version: 1, requests: {}, uploads: {} };
}

export function loadStore(): Store {
  const file = statePath();
  if (!existsSync(file)) return emptyStore();
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<Store>;
    return {
      version: 1,
      requests: parsed.requests ?? {},
      uploads: parsed.uploads ?? {},
    };
  } catch {
    throw new CliError(`Could not read the request store at ${file}.`, ExitCode.ERROR);
  }
}

export function saveStore(store: Store): void {
  const dir = stateDir();
  mkdirSync(dir, { recursive: true });
  const file = statePath();
  const tmp = path.join(dir, `.requests.${process.pid}.tmp`);
  writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  renameSync(tmp, file);
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) sorted[key] = stable(source[key]);
    return sorted;
  }
  return value;
}

export function dedupeKey(endpoint: string, input: Record<string, unknown>): string {
  return createHash("sha256").update(`${endpoint}\n${JSON.stringify(stable(input))}`).digest("hex");
}

export function findDuplicate(store: Store, key: string, owner: string): JobRecord | undefined {
  return Object.values(store.requests).find(
    (job) => job.dedupe_key === key && job.owner === owner && ACTIVE_STATUSES.has(job.status),
  );
}

export function upsertJob(store: Store, job: JobRecord): void {
  store.requests[job.request_id] = job;
  saveStore(store);
}

export function updateJob(store: Store, requestId: string, patch: Partial<JobRecord>): JobRecord {
  const job = store.requests[requestId];
  if (!job) throw new CliError(`Unknown request ${requestId}.`, ExitCode.NOT_FOUND);
  Object.assign(job, patch, { updated_at: new Date().toISOString() });
  saveStore(store);
  return job;
}

export function ownedJob(
  store: Store,
  requestId: string,
  owner: string,
  allowAny: boolean,
): JobRecord {
  const job = store.requests[requestId];
  if (!job) throw new CliError(`Unknown request ${requestId}.`, ExitCode.NOT_FOUND);
  if (!allowAny && job.owner !== owner) {
    throw new CliError(
      `Request ${requestId} belongs to "${job.owner}", not "${owner}". Pass --any-owner to override.`,
      ExitCode.AUTH,
    );
  }
  return job;
}

export function jobsForOwner(store: Store, owner: string, allowAny: boolean): JobRecord[] {
  return Object.values(store.requests)
    .filter((job) => allowAny || job.owner === owner)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}
