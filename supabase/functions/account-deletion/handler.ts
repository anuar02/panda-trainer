export type Receipt = {
  request_id: string;
  user_id: string;
  status: "prepared" | "database_deleted" | "complete";
};
export interface Transport {
  getUser(token: string): Promise<string | null>;
  inspect(userId: string): Promise<unknown>;
  prepare(requestId: string, userId: string, hash: string): Promise<Receipt>;
  status(requestId: string, hash: string): Promise<Receipt | null>;
  execute(requestId: string, hash: string): Promise<Receipt>;
  deleteUser(userId: string): Promise<void>;
  complete(requestId: string, hash: string): Promise<Receipt>;
}
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Cache-Control": "no-store",
};
export const preflight = () =>
  new Response(null, { status: 204, headers: corsHeaders });
export const reply = (status: number, body: unknown) =>
  Response.json(body, {
    status,
    headers: corsHeaders,
  });
export async function handleDeletion(
  request: Request,
  transport: Transport,
): Promise<Response> {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "POST")
    return reply(405, { error: "method-not-allowed" });
  try {
    const maxBytes = 2048;
    const declaredLength = request.headers.get("content-length");
    if (declaredLength && Number(declaredLength) > maxBytes)
      return reply(413, { error: "request-too-large" });
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    if (reader) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > maxBytes) {
            await reader.cancel();
            return reply(413, { error: "request-too-large" });
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    const buffer = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(buffer));
    } catch {
      return reply(400, { error: "invalid-request" });
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return reply(400, { error: "invalid-request" });
    const input = body as Record<string, unknown>;
    const authorization = request.headers.get("authorization");
    const bearer = authorization?.match(/^Bearer (\S+)$/i)?.[1];
    if (input.action === "inspect") {
      if (Object.keys(input).some((key) => key !== "action"))
        return reply(400, { error: "invalid-request" });
      const userId = bearer ? await transport.getUser(bearer) : null;
      if (!userId) return reply(401, { error: "identity-required" });
      return reply(200, await transport.inspect(userId));
    }
    if (
      (input.action !== "status" && input.action !== "delete") ||
      typeof input.requestId !== "string" ||
      !uuid.test(input.requestId) ||
      typeof input.recoveryToken !== "string" ||
      !/^[0-9a-f]{64}$/.test(input.recoveryToken) ||
      Object.keys(input).some(
        (key) => !["action", "requestId", "recoveryToken"].includes(key),
      )
    ) {
      return reply(400, { error: "invalid-request" });
    }
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(input.recoveryToken),
    );
    const hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const userId = bearer ? await transport.getUser(bearer) : null;
    if (authorization && !userId)
      return reply(401, { error: "identity-required" });
    let receipt = await transport.status(input.requestId, hash);
    if (receipt && userId && receipt.user_id !== userId)
      return reply(403, { error: "identity-mismatch" });
    if (!receipt && input.action === "status")
      return reply(404, { error: "request-not-found" });
    if (!receipt) {
      if (!userId) return reply(401, { error: "identity-required" });
      receipt = await transport.prepare(input.requestId, userId, hash);
    }
    if (
      receipt.request_id !== input.requestId ||
      (userId && receipt.user_id !== userId) ||
      typeof receipt.user_id !== "string" ||
      receipt.user_id.length === 0 ||
      !["prepared", "database_deleted", "complete"].includes(receipt.status)
    )
      throw new Error("invalid-receipt");
    const originalRequestId = receipt.request_id;
    const originalUserId = receipt.user_id;
    const assertIdentity = (value: Receipt) => {
      if (
        value.request_id !== originalRequestId ||
        value.user_id !== originalUserId
      )
        throw new Error("invalid-receipt");
    };
    if (input.action === "delete" && receipt.status !== "complete") {
      receipt = await transport.execute(input.requestId, hash);
      assertIdentity(receipt);
      if (
        receipt.status !== "database_deleted" &&
        receipt.status !== "complete"
      )
        throw new Error("invalid-state");
      if (receipt.status !== "complete") {
        await transport.deleteUser(originalUserId);
        receipt = await transport.complete(input.requestId, hash);
        assertIdentity(receipt);
        if (receipt.status !== "complete") throw new Error("invalid-state");
      }
    }
    return reply(200, {
      requestId: receipt.request_id,
      status: receipt.status,
    });
  } catch {
    return reply(503, { error: "retry-required" });
  }
}
