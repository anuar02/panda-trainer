import {
  buildInput,
  ENDPOINTS,
  extractMedia,
  type GenerationOptions,
  type Kind,
} from "./endpoints";
import {
  envWebhook,
  outDir,
  readCredentials,
  readOwner,
  type Credentials,
} from "./config";
import { CliError, ExitCode, mapApiError, usageError } from "./errors";
import {
  dedupeKey,
  findDuplicate,
  jobsForOwner,
  loadStore,
  ownedJob,
  updateJob,
  upsertJob,
  type JobRecord,
  type Store,
} from "./jobs";
import {
  cancelRequest,
  configureSdk,
  downloadMedia,
  fetchStatus,
  listSoulStyles,
  pollUntilTerminal,
  resolveMedia,
  submit,
  type StatusSnapshot,
} from "./api";

interface ParsedArgs {
  command?: string;
  positionals: string[];
  values: Map<string, string[]>;
  flags: Set<string>;
  negated: Set<string>;
}

const VALUE_FLAGS = new Set([
  "prompt",
  "resolution",
  "duration",
  "aspect",
  "seed",
  "batch",
  "style",
  "image",
  "image-url",
  "video-url",
  "audio-url",
  "end-image",
  "owner",
  "timeout",
  "out",
  "webhook",
  "webhook-secret",
]);

const BOOLEAN_FLAGS = new Set(["force", "json", "download", "help", "any-owner", "wait"]);
const NEGATABLE_FLAGS = new Set(["audio", "enhance", "wait"]);
const REPEATABLE_FLAGS = new Set(["image", "image-url", "video-url", "audio-url"]);

function addValue(parsed: ParsedArgs, name: string, value: string): void {
  const list = parsed.values.get(name) ?? [];
  list.push(value);
  parsed.values.set(name, list);
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    positionals: [],
    values: new Map(),
    flags: new Set(),
    negated: new Set(),
  };

  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (token === "-h" || token === "--help") {
      parsed.flags.add("help");
      continue;
    }
    if (token.startsWith("--")) {
      const body = token.slice(2);
      const negatedName = body.startsWith("no-") ? body.slice(3) : undefined;
      if (negatedName && NEGATABLE_FLAGS.has(negatedName)) {
        parsed.negated.add(negatedName);
        continue;
      }
      if (body.includes("=")) {
        const [name, ...rest] = body.split("=");
        if (!VALUE_FLAGS.has(name)) throw usageError(`Unknown flag "--${name}".`);
        addValue(parsed, name, rest.join("="));
        continue;
      }
      if (BOOLEAN_FLAGS.has(body)) {
        parsed.flags.add(body);
        continue;
      }
      if (VALUE_FLAGS.has(body)) {
        const next = argv[index + 1];
        if (next !== undefined && !next.startsWith("--")) {
          addValue(parsed, body, next);
          index++;
        } else {
          addValue(parsed, body, "true");
        }
        continue;
      }
      throw usageError(`Unknown flag "--${body}".`);
    }
    parsed.positionals.push(token);
  }

  parsed.command = parsed.positionals.shift();
  return parsed;
}

function first(parsed: ParsedArgs, name: string): string | undefined {
  return parsed.values.get(name)?.[0];
}

function all(parsed: ParsedArgs, name: string): string[] {
  return parsed.values.get(name) ?? [];
}

function bool(parsed: ParsedArgs, name: string): boolean | undefined {
  if (parsed.negated.has(name)) return false;
  if (parsed.flags.has(name)) return true;
  return undefined;
}

function number(parsed: ParsedArgs, name: string): number | undefined {
  const raw = first(parsed, name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw usageError(`--${name} must be a number.`);
  return value;
}

function log(message: string): void {
  process.stderr.write(`${message}\n`);
}

function emit(parsed: ParsedArgs, payload: unknown): void {
  if (bool(parsed, "json")) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function loadCredentials(): Credentials {
  try {
    return readCredentials();
  } catch (error) {
    throw new CliError((error as Error).message, ExitCode.AUTH);
  }
}

function generationOptions(parsed: ParsedArgs): GenerationOptions {
  const positionalPrompt = parsed.positionals.join(" ").trim();
  return {
    prompt: first(parsed, "prompt") ?? (positionalPrompt || undefined),
    resolution: first(parsed, "resolution"),
    duration: number(parsed, "duration"),
    aspect: first(parsed, "aspect"),
    audio: bool(parsed, "audio"),
    seed: number(parsed, "seed"),
    batch: number(parsed, "batch"),
    enhance: bool(parsed, "enhance"),
    style: first(parsed, "style"),
    image: first(parsed, "image"),
    endImage: first(parsed, "end-image"),
    imageUrls: all(parsed, "image-url"),
    videoUrls: all(parsed, "video-url"),
    audioUrls: all(parsed, "audio-url"),
  };
}

function webhookConfig(parsed: ParsedArgs): { url: string; secret?: string } | undefined {
  const fromEnv = envWebhook();
  const url = first(parsed, "webhook") ?? fromEnv.url;
  if (!url) return undefined;
  const secret = first(parsed, "webhook-secret") ?? fromEnv.secret;
  return { url, secret };
}

async function resolveIfLocal(
  value: string | undefined,
  credentials: Credentials,
  store: Store,
): Promise<string | undefined> {
  if (!value) return value;
  return resolveMedia(value, credentials, store);
}

async function runGeneration(kind: Kind, parsed: ParsedArgs): Promise<number> {
  const credentials = loadCredentials();
  const owner = readOwner(first(parsed, "owner"));
  const store = loadStore();
  const options = generationOptions(parsed);

  if (kind !== "animate" && !options.prompt?.trim()) {
    throw usageError("A non-empty --prompt is required.");
  }

  if (kind === "animate") {
    options.image = await resolveIfLocal(options.image, credentials, store);
    options.endImage = await resolveIfLocal(options.endImage, credentials, store);
  }
  if (kind === "refs") {
    options.imageUrls = await Promise.all(
      options.imageUrls.map((url) => resolveIfLocal(url, credentials, store) as Promise<string>),
    );
  }

  const endpoint = ENDPOINTS[kind].endpoint;
  const input = buildInput(kind, options);
  const key = dedupeKey(endpoint, input);

  const duplicate = findDuplicate(store, key, owner);
  if (duplicate && !bool(parsed, "force")) {
    throw new CliError(
      `Identical request already ${duplicate.status}: ${duplicate.request_id}. Use --force to submit anyway, or check it with: npm run higgsfield -- status ${duplicate.request_id}`,
      ExitCode.RATE_LIMIT,
    );
  }

  configureSdk(credentials);
  const webhook = webhookConfig(parsed);
  log(`Submitting ${ENDPOINTS[kind].label}${webhook ? ` with webhook ${webhook.url}` : ""}...`);

  const response = await submit(endpoint, input, webhook);
  const requestId = response.request_id;
  const now = new Date().toISOString();
  const job: JobRecord = {
    request_id: requestId,
    endpoint,
    kind,
    owner,
    dedupe_key: key,
    input,
    status: response.status,
    created_at: now,
    updated_at: now,
    status_url: response.status_url,
    cancel_url: response.cancel_url,
    media: [],
  };
  upsertJob(store, job);
  log(`request_id ${requestId} — status ${response.status}`);

  if (parsed.negated.has("wait")) {
    const payload = {
      request_id: requestId,
      status: response.status,
      status_url: response.status_url,
      cancel_url: response.cancel_url,
      submitted: true,
    };
    if (bool(parsed, "json")) emit(parsed, payload);
    else process.stdout.write(`${requestId}\n`);
    log("Submitted without waiting (--no-wait).");
    return ExitCode.OK;
  }

  const timeoutMs = (number(parsed, "timeout") ?? 900) * 1000;
  const snapshot = await pollUntilTerminal({
    requestId,
    credentials,
    timeoutMs,
    onUpdate: (current, elapsed) => {
      updateJob(store, requestId, { status: current.status });
      log(`[${formatDuration(elapsed)}] ${current.status}`);
    },
  });

  const media = extractMedia(snapshot);
  const error = typeof snapshot.error === "string" ? snapshot.error : undefined;
  updateJob(store, requestId, { status: snapshot.status, media, error });

  const payload = {
    request_id: requestId,
    status: snapshot.status,
    media,
    error,
    submitted: false,
  };
  if (bool(parsed, "json")) emit(parsed, payload);

  if (snapshot.status !== "completed") {
    if (snapshot.status === "failed") {
      throw new CliError(error ? `Generation failed: ${error}` : "Generation failed.", ExitCode.GENERATION_FAILED);
    }
    if (snapshot.status === "nsfw") {
      throw new CliError("Generation was rejected by content moderation (nsfw).", ExitCode.GENERATION_FAILED);
    }
    throw new CliError("Generation was canceled.", ExitCode.GENERATION_FAILED);
  }

  if (media.length === 0) {
    throw new CliError(`Request ${requestId} completed without media URLs.`, ExitCode.ERROR);
  }

  if (!bool(parsed, "json")) {
    process.stdout.write(`${media.join("\n")}\n`);
  }

  if (bool(parsed, "download")) {
    const directory = first(parsed, "out") ?? outDir();
    const saved: string[] = [];
    for (const url of media) saved.push(await downloadMedia(url, directory));
    if (bool(parsed, "json")) return ExitCode.OK;
    saved.forEach((file) => log(`saved ${file}`));
  }

  return ExitCode.OK;
}

function summarize(job: JobRecord): Record<string, unknown> {
  return {
    request_id: job.request_id,
    kind: job.kind,
    owner: job.owner,
    status: job.status,
    created_at: job.created_at,
    media: job.media,
    error: job.error,
  };
}

async function runStatus(parsed: ParsedArgs): Promise<number> {
  const credentials = loadCredentials();
  const owner = readOwner(first(parsed, "owner"));
  const store = loadStore();
  const anyOwner = Boolean(bool(parsed, "any-owner"));

  if (parsed.positionals.length === 0) {
    const jobs = jobsForOwner(store, owner, anyOwner);
    if (jobs.length === 0) {
      log(`No tracked requests for owner "${owner}".`);
      return ExitCode.OK;
    }
    const results: Record<string, unknown>[] = [];
    for (const job of jobs) {
      const snapshot = await fetchStatus(job.request_id, credentials);
      const media = extractMedia(snapshot);
      updateJob(store, job.request_id, { status: snapshot.status, media });
      results.push({ ...summarize({ ...job, status: snapshot.status, media }) });
    }
    if (bool(parsed, "json")) emit(parsed, results);
    else for (const result of results) log(`${result.request_id}  ${String(result.status).padEnd(12)} ${result.kind}`);
    return ExitCode.OK;
  }

  if (parsed.positionals.length > 1) throw usageError("status accepts a single request_id.");
  const requestId = parsed.positionals[0];
  const job = ownedJob(store, requestId, owner, anyOwner);

  let snapshot: StatusSnapshot;
  if (bool(parsed, "wait")) {
    snapshot = await pollUntilTerminal({
      requestId,
      credentials,
      timeoutMs: (number(parsed, "timeout") ?? 900) * 1000,
      onUpdate: (current, elapsed) => {
        updateJob(store, requestId, { status: current.status });
        log(`[${formatDuration(elapsed)}] ${current.status}`);
      },
    });
  } else {
    snapshot = await fetchStatus(requestId, credentials);
  }

  const media = extractMedia(snapshot);
  const error = typeof snapshot.error === "string" ? snapshot.error : undefined;
  updateJob(store, requestId, { status: snapshot.status, media, error });

  const payload = {
    ...summarize({ ...job, status: snapshot.status, media, error }),
    status_url: job.status_url,
    cancel_url: job.cancel_url,
  };
  if (bool(parsed, "json")) emit(parsed, payload);
  else {
    log(`${requestId}  ${snapshot.status}`);
    media.forEach((url) => log(url));
  }

  if (snapshot.status === "failed" || snapshot.status === "nsfw") return ExitCode.GENERATION_FAILED;
  return ExitCode.OK;
}

async function runList(parsed: ParsedArgs): Promise<number> {
  const owner = readOwner(first(parsed, "owner"));
  const store = loadStore();
  const jobs = jobsForOwner(store, owner, Boolean(bool(parsed, "any-owner")));

  if (bool(parsed, "json")) {
    emit(parsed, jobs.map(summarize));
    return ExitCode.OK;
  }
  if (jobs.length === 0) {
    log(`No tracked requests for owner "${owner}".`);
    return ExitCode.OK;
  }
  for (const job of jobs) {
    log(`${job.request_id}  ${job.status.padEnd(12)} ${job.kind.padEnd(8)} ${job.created_at}  ${job.media[0] ?? ""}`);
  }
  return ExitCode.OK;
}

async function runCancel(parsed: ParsedArgs): Promise<number> {
  const credentials = loadCredentials();
  const owner = readOwner(first(parsed, "owner"));
  if (parsed.positionals.length !== 1) throw usageError("cancel needs exactly one request_id.");
  const store = loadStore();
  const job = ownedJob(store, parsed.positionals[0], owner, Boolean(bool(parsed, "any-owner")));

  await cancelRequest(job.request_id, credentials);
  updateJob(store, job.request_id, { status: "canceled" });
  if (bool(parsed, "json")) emit(parsed, { request_id: job.request_id, status: "canceled" });
  else log(`Canceled ${job.request_id}.`);
  return ExitCode.OK;
}

async function runStyles(parsed: ParsedArgs): Promise<number> {
  const credentials = loadCredentials();
  const styles = await listSoulStyles(credentials);
  if (bool(parsed, "json")) {
    emit(parsed, styles);
    return ExitCode.OK;
  }
  for (const style of styles) log(`${style.id}  ${style.name}`);
  return ExitCode.OK;
}

function printHelp(): void {
  process.stdout.write(`higgsfield — generate images and videos through the Higgsfield API

Usage:
  npm run higgsfield -- <command> [prompt] [options]

Commands:
  video      Text to video (Seedance 2.0)
  image      Text to image (SOUL 2)
  animate    Image to video (Seedance 2.0)         --image <path|url>
  refs       Reference to video (Seedance 2.0)     --image-url / --video-url / --audio-url
  status     [request_id]  refresh status (no id: all tracked requests)
  list       List tracked requests
  cancel     <request_id>  cancel a queued request
  styles     List SOUL 2 style ids

Options:
  --prompt <text>        Prompt (or pass it as a positional argument)
  --resolution <r>       video: 480p|720p|1080p|4k  ·  image: 720p|1080p
  --duration <4-15>      Video length in seconds (default 5)
  --aspect <ratio>       video: 16:9|4:3|1:1|3:4|9:16|21:9  ·  image: 9:16|16:9|4:3|3:4|1:1|2:3|3:2
  --no-audio             Disable generate_audio
  --seed <1-1000000>     image: reproducible seed
  --batch <1|4>          image: number of images
  --no-enhance           image: disable prompt enhancement
  --style <uuid>         image: SOUL style id (see "styles")
  --image <path|url>     animate: first frame (a local file is uploaded)
  --end-image <path|url> animate: last frame
  --image-url <url>      refs: reference image (repeatable, max 9)
  --video-url <url>      refs: reference video (repeatable, max 3)
  --audio-url <url>      refs: reference audio (repeatable, max 3)
  --owner <label>        Identity/tenant attached to the request (default $HF_OWNER)
  --any-owner            Allow reading or cancelling another owner's request
  --webhook <url>        Deliver the result to an HTTPS webhook instead of polling
  --webhook-secret <s>   Webhook secret (default $HF_WEBHOOK_SECRET)
  --no-wait              Submit and print the request_id, then exit
  --timeout <seconds>    Poll timeout (default 900)
  --download             Save completed media to the output directory
  --out <dir>            Download directory (default $HF_OUT_DIR)
  --force                Submit even if an identical request is in flight
  --json                 Machine-readable output on stdout
  -h, --help             Show this help
`);
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);

  if (parsed.flags.has("help")) {
    printHelp();
    return ExitCode.OK;
  }
  if (!parsed.command) {
    printHelp();
    return ExitCode.USAGE;
  }

  try {
    switch (parsed.command) {
      case "video":
        return await runGeneration("video", parsed);
      case "image":
        return await runGeneration("image", parsed);
      case "animate":
        return await runGeneration("animate", parsed);
      case "refs":
        return await runGeneration("refs", parsed);
      case "status":
        return await runStatus(parsed);
      case "list":
        return await runList(parsed);
      case "cancel":
        return await runCancel(parsed);
      case "styles":
        return await runStyles(parsed);
      default:
        throw usageError(`Unknown command "${parsed.command}". Run with --help for usage.`);
    }
  } catch (error) {
    throw mapApiError(error);
  }
}
