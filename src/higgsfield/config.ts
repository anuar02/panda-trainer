import os from "node:os";
import path from "node:path";

export interface Credentials {
  id: string;
  secret: string;
}

export function apiBaseUrl(): string {
  return (process.env.HF_BASE_URL?.trim() || "https://api.higgsfield.ai").replace(/\/+$/, "");
}

export function readCredentials(): Credentials {
  const raw = process.env.HF_CREDENTIALS?.trim();
  if (raw) {
    const separator = raw.indexOf(":");
    if (separator <= 0 || separator === raw.length - 1) {
      throw new Error("HF_CREDENTIALS must use the key-id:key-secret format.");
    }
    return { id: raw.slice(0, separator), secret: raw.slice(separator + 1) };
  }
  const id = process.env.HF_API_KEY_ID?.trim();
  const secret = process.env.HF_API_KEY_SECRET?.trim();
  if (id && secret) return { id, secret };
  throw new Error(
    "Missing credentials. Set HF_CREDENTIALS=key-id:key-secret in .env.local (see README).",
  );
}

export function credentialsValue(credentials: Credentials): string {
  return `${credentials.id}:${credentials.secret}`;
}

export function authorizationHeader(credentials: Credentials): string {
  return `Key ${credentialsValue(credentials)}`;
}

export function readOwner(explicit?: string): string {
  return explicit?.trim() || process.env.HF_OWNER?.trim() || os.userInfo().username || "local";
}

export function stateDir(): string {
  return process.env.HF_STATE_DIR?.trim() || path.join(".tmp", "higgsfield");
}

export function outDir(): string {
  return process.env.HF_OUT_DIR?.trim() || path.join(stateDir(), "output");
}

export function statePath(): string {
  return path.join(stateDir(), "requests.json");
}

export function envWebhook(): { url?: string; secret?: string } {
  return {
    url: process.env.HF_WEBHOOK_URL?.trim() || undefined,
    secret: process.env.HF_WEBHOOK_SECRET?.trim() || undefined,
  };
}
