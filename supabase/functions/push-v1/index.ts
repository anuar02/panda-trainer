import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { runPush, type Claim, type Transport } from "./worker.ts";
const transport: Transport = async (url, body) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const accessToken = Deno.env.get("EXPO_PUSH_ACCESS_TOKEN");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return { status: response.status, body: await response.json() };
  } finally {
    clearTimeout(timer);
  }
};
Deno.serve(async (request) => {
  const secret = Deno.env.get("PUSH_WORKER_SECRET");
  if (
    !secret ||
    request.method !== "POST" ||
    request.headers.get("Authorization") !== `Bearer ${secret}`
  )
    return new Response(null, { status: 401 });
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const morning = Deno.env.get("PUSH_MORNING_LOCAL_TIME");
  if (!url || !key || !morning) return new Response(null, { status: 503 });
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const result = await runPush(
      {
        schedule: async (now, time) => {
          const result = await client.rpc("schedule_push_v1", {
            p_now: now,
            p_morning: time,
          });
          if (result.error) throw new Error("Push storage unavailable");
        },
        claim: async (limit) => {
          const result = await client.rpc("claim_push_v1", { p_limit: limit });
          if (result.error || !Array.isArray(result.data))
            throw new Error("Push storage unavailable");
          return result.data as Claim[];
        },
        complete: async (claim, outcome) => {
          const result = await client.rpc("complete_push_v1", {
            p_id: claim.id,
            p_lease: claim.lease,
            p_outcome: outcome.outcome,
            p_ticket: outcome.ticket,
            p_error: outcome.error,
          });
          if (result.error || result.data !== true)
            throw new Error("Push completion unavailable");
        },
      },
      transport,
      new Date(),
      morning,
    );
    return Response.json(result);
  } catch {
    return new Response(null, { status: 503 });
  }
});
