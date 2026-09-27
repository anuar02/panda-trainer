import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { configure, higgsfield, type V2Response } from "@higgsfield/client/v2";
import { apiBaseUrl, authorizationHeader, type Credentials } from "./config";
import { CliError, ExitCode, mapApiError } from "./errors";
import { saveStore, type Store } from "./jobs";

const TERMINAL_STATUSES = new Set(["completed", "failed", "nsfw", "canceled", "cancelled"]);

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".wav": "audio/wav",
};

export interface StatusSnapshot {
  status: string;
  [key: string]: unknown;
}

export interface WebhookConfig {
  url: string;
  secret?: string;
}

export function configureSdk(credentials: Credentials): void {
  configure({
    credentials: `${credentials.id}:${credentials.secret}`,
    baseURL: apiBaseUrl(),
    maxRetries: 0,
  });
}

export async function submit(
  endpoint: string,
  input: Record<string, unknown>,
  webhook?: WebhookConfig,
): Promise<V2Response> {
  try {
    return await higgsfield.subscribe(endpoint, {
      input,
      withPolling: false,
      ...(webhook ? { webhook: { url: webhook.url, secret: webhook.secret ?? "" } } : {}),
    });
  } catch (error) {
    throw mapApiError(error);
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelay(attempt: number): number {
  return Math.min(2000 * 1.5 ** attempt, 10000) + Math.random() * 500;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) {
      return body.detail
        .map((item) => (item as { msg?: string })?.msg ?? JSON.stringify(item))
        .join("; ");
    }
    return JSON.stringify(body);
  } catch {
    return response.statusText || `HTTP ${response.status}`;
  }
}

function httpError(status: number, detail: string): CliError {
  if (status === 401) return new CliError("Higgsfield rejected the credentials (401).", ExitCode.AUTH);
  if (status === 403) return new CliError("Insufficient credits (403).", ExitCode.CREDITS);
  if (status === 404) return new CliError(detail, ExitCode.NOT_FOUND);
  if (status === 429) return new CliError(`Rate limited: ${detail}`, ExitCode.RATE_LIMIT);
  if (status === 400 && /concurrent/i.test(detail)) {
    return new CliError(
      `${detail} Wait for an in-flight request to finish, then retry (generation POSTs are not retried automatically).`,
      ExitCode.RATE_LIMIT,
    );
  }
  if (status === 400 || status === 422) return new CliError(detail, ExitCode.USAGE);
  if (status === 423 || status === 503) {
    return new CliError(`${detail} (model temporarily unavailable; retry later)`, ExitCode.ERROR);
  }
  return new CliError(detail, ExitCode.ERROR);
}

async function restFetch(
  url: string,
  credentials: Credentials,
  init: RequestInit = {},
): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      headers: { Authorization: authorizationHeader(credentials), ...(init.headers ?? {}) },
    });
  } catch (error) {
    throw new CliError(
      `Network error calling ${url}: ${(error as Error).message}`,
      ExitCode.ERROR,
    );
  }
}

export async function fetchStatus(
  requestId: string,
  credentials: Credentials,
): Promise<StatusSnapshot> {
  const url = `${apiBaseUrl()}/requests/${encodeURIComponent(requestId)}/status`;
  const response = await restFetch(url, credentials);
  if (!response.ok) throw httpError(response.status, await readError(response));
  return (await response.json()) as StatusSnapshot;
}

export interface PollOptions {
  requestId: string;
  credentials: Credentials;
  timeoutMs: number;
  onUpdate?: (snapshot: StatusSnapshot, elapsedMs: number) => void;
}

export async function pollUntilTerminal(options: PollOptions): Promise<StatusSnapshot> {
  const started = Date.now();
  let attempt = 0;
  while (true) {
    let snapshot: StatusSnapshot;
    try {
      snapshot = await fetchStatus(options.requestId, options.credentials);
    } catch (error) {
      const cli = error instanceof CliError ? error : mapApiError(error);
      if (cli.exitCode !== ExitCode.ERROR) throw cli;
      if (Date.now() - started > options.timeoutMs) {
        throw new CliError(
          `Timed out after ${Math.round((Date.now() - started) / 1000)}s while polling ${options.requestId}.`,
          ExitCode.TIMEOUT,
        );
      }
      await sleep(backoffDelay(attempt++));
      continue;
    }

    options.onUpdate?.(snapshot, Date.now() - started);
    if (TERMINAL_STATUSES.has(snapshot.status)) return snapshot;
    if (Date.now() - started > options.timeoutMs) {
      throw new CliError(
        `Timed out after ${Math.round((Date.now() - started) / 1000)}s; last status "${snapshot.status}". Re-check with: npm run higgsfield -- status ${options.requestId}`,
        ExitCode.TIMEOUT,
      );
    }
    await sleep(backoffDelay(attempt++));
  }
}

export async function cancelRequest(requestId: string, credentials: Credentials): Promise<void> {
  const url = `${apiBaseUrl()}/requests/${encodeURIComponent(requestId)}/cancel`;
  const response = await restFetch(url, credentials, { method: "POST" });
  if (response.status === 202) return;
  if (response.status === 400) {
    throw new CliError(
      `Cannot cancel ${requestId}: ${await readError(response)}`,
      ExitCode.ERROR,
    );
  }
  if (!response.ok) throw httpError(response.status, await readError(response));
}

export interface SoulStyle {
  id: string;
  name: string;
  description?: string;
  preview_url?: string;
}

export async function listSoulStyles(credentials: Credentials): Promise<SoulStyle[]> {
  const response = await restFetch(`${apiBaseUrl()}/v1/text2image/soul-styles/v2`, credentials);
  if (!response.ok) throw httpError(response.status, await readError(response));
  return (await response.json()) as SoulStyle[];
}

export async function resolveMedia(
  value: string,
  credentials: Credentials,
  store: Store,
): Promise<string> {
  if (/^https:\/\//i.test(value)) return value;
  return uploadLocalFile(value, credentials, store);
}

export async function uploadLocalFile(
  filePath: string,
  credentials: Credentials,
  store: Store,
): Promise<string> {
  const absolute = path.resolve(filePath);
  if (!existsSync(absolute)) throw new CliError(`File not found: ${absolute}`, ExitCode.USAGE);

  const info = await stat(absolute);
  const cacheKey = `${absolute}:${info.size}:${Math.round(info.mtimeMs)}`;
  const cached = store.uploads[cacheKey];
  if (cached) return cached.public_url;

  const extension = path.extname(absolute).toLowerCase();
  const contentType = CONTENT_TYPES[extension];
  if (!contentType) {
    throw new CliError(
      `Unsupported file type "${extension}". Supported: jpg, jpeg, png, webp, gif, mp4, wav.`,
      ExitCode.USAGE,
    );
  }

  const createResponse = await restFetch(`${apiBaseUrl()}/files/generate-upload-url`, credentials, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content_type: contentType }),
  });
  if (!createResponse.ok) {
    throw httpError(createResponse.status, await readError(createResponse));
  }
  const slot = (await createResponse.json()) as {
    public_url: string;
    upload_url: string;
    upload_headers?: Record<string, string>;
  };

  const body = await readFile(absolute);
  const uploadResponse = await fetch(slot.upload_url, {
    method: "PUT",
    headers: { ...(slot.upload_headers ?? {}) },
    body,
  });
  if (!uploadResponse.ok) {
    throw new CliError(`Upload failed (${uploadResponse.status}).`, ExitCode.ERROR);
  }

  store.uploads[cacheKey] = { public_url: slot.public_url, created_at: new Date().toISOString() };
  saveStore(store);
  return slot.public_url;
}

function safeName(url: string): string {
  try {
    const base = path.basename(new URL(url).pathname);
    if (base && base !== "/") return base;
  } catch {
    return `higgsfield-${Date.now()}`;
  }
  return `higgsfield-${Date.now()}`;
}

export async function downloadMedia(url: string, directory: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new CliError(`Failed to download ${url}: ${(error as Error).message}`, ExitCode.ERROR);
  }
  if (!response.ok || !response.body) {
    throw new CliError(`Failed to download ${url} (${response.status}).`, ExitCode.ERROR);
  }
  await mkdir(directory, { recursive: true });
  const destination = path.join(directory, safeName(url));
  await pipeline(
    Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
    createWriteStream(destination),
  );
  return destination;
}
