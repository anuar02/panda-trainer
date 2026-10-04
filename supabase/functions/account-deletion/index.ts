import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import {
  handleDeletion,
  preflight,
  reply,
  type Receipt,
  type Transport,
} from "./handler.ts";
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return preflight();
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return reply(503, { error: "unavailable" });
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
    },
  });
  const rpc = async (
    name: string,
    args: Record<string, string>,
  ): Promise<unknown> => {
    const result = await client.rpc(name, args);
    if (result.error) throw new Error("storage-unavailable");
    return result.data;
  };
  const receipt = (value: unknown): Receipt => {
    if (!value || typeof value !== "object") throw new Error("invalid-receipt");
    const row = value as Record<string, unknown>;
    if (
      typeof row.request_id !== "string" ||
      typeof row.user_id !== "string" ||
      !["prepared", "database_deleted", "complete"].includes(String(row.status))
    )
      throw new Error("invalid-receipt");
    return row as Receipt;
  };
  const transport: Transport = {
    getUser: async (token) => {
      const result = await client.auth.getUser(token);
      return result.error ? null : (result.data.user?.id ?? null);
    },
    inspect: (userId) => rpc("account_deletion_inspect", { p_user_id: userId }),
    prepare: async (requestId, userId, hash) =>
      receipt(
        await rpc("account_deletion_prepare", {
          p_request_id: requestId,
          p_user_id: userId,
          p_capability_hash: hash,
        }),
      ),
    status: async (requestId, hash) => {
      const value = await rpc("account_deletion_status", {
        p_request_id: requestId,
        p_capability_hash: hash,
      });
      return value === null ? null : receipt(value);
    },
    execute: async (requestId, hash) =>
      receipt(
        await rpc("account_deletion_execute", {
          p_request_id: requestId,
          p_capability_hash: hash,
        }),
      ),
    deleteUser: async (userId) => {
      const result = await client.auth.admin.deleteUser(userId, false);
      if (result.error && result.error.code !== "user_not_found")
        throw new Error("auth-unavailable");
    },
    complete: async (requestId, hash) =>
      receipt(
        await rpc("account_deletion_complete", {
          p_request_id: requestId,
          p_capability_hash: hash,
        }),
      ),
  };
  return handleDeletion(request, transport);
});
