export type Claim = {
  id: string;
  lease: string;
  state: "sending" | "receipt";
  ticket: string | null;
  token: string;
  notificationId: string;
  workspaceId: string;
  kind: string;
  summaryCount?: number | null;
};
export type Outcome = {
  outcome:
    | "ticket"
    | "delivered"
    | "retry"
    | "failed"
    | "invalid"
    | "unknown"
    | "waiting";
  ticket?: string;
  error?: string;
};
export type PushStore = {
  schedule(now: string, morning: string): Promise<void>;
  claim(limit: number): Promise<Claim[]>;
  complete(claim: Claim, outcome: Outcome): Promise<void>;
};
export type Transport = (
  url: string,
  body: unknown,
) => Promise<{ status: number; body: unknown }>;
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const messages: Record<string, string> = {
  booking_requested: "Новое занятие",
  booking_confirmed: "Занятие подтверждено",
  booking_cancelled: "Занятие отменено",
  booking_rescheduled: "Занятие перенесено",
  reschedule_requested: "Предложен перенос",
  reschedule_declined: "Запрос на перенос отклонён",
  reschedule_withdrawn: "Запрос на перенос отозван",
  booking_reminder: "Занятие начнётся в течение двух часов",
  daily_plan: "План занятий на сегодня",
};
const responseOutcome = (value: unknown, receipt: boolean): Outcome => {
  if (!object(value))
    return {
      outcome: receipt ? "waiting" : "unknown",
      error: receipt ? "receipt_unavailable" : "send_outcome_unknown",
    };
  if (value.status === "ok") {
    if (receipt) return { outcome: "delivered" };
    if (
      typeof value.id === "string" &&
      value.id.length > 0 &&
      value.id.length <= 200
    )
      return { outcome: "ticket", ticket: value.id };
    return { outcome: "unknown", error: "send_outcome_unknown" };
  }
  if (value.status !== "error")
    return { outcome: receipt ? "waiting" : "unknown" };
  const code =
    object(value.details) && typeof value.details.error === "string"
      ? value.details.error
      : "";
  return code === "DeviceNotRegistered"
    ? { outcome: "invalid", error: code }
    : code === "MessageRateExceeded"
      ? { outcome: "retry", error: code }
      : { outcome: "failed", error: code };
};
export async function deliver(
  claim: Claim,
  transport: Transport,
): Promise<Outcome> {
  const receipt = claim.state === "receipt";
  try {
    if (receipt && !claim.ticket) return { outcome: "failed" };
    if (!receipt && !messages[claim.kind]) return { outcome: "failed" };
    if (
      !receipt &&
      claim.kind === "daily_plan" &&
      (!Number.isSafeInteger(claim.summaryCount) ||
        Number(claim.summaryCount) <= 0)
    )
      return { outcome: "failed" };
    const body =
      claim.kind === "daily_plan"
        ? `${messages.daily_plan}. Занятий: ${claim.summaryCount}`
        : messages[claim.kind];
    const result = await transport(
      receipt
        ? "https://exp.host/--/api/v2/push/getReceipts"
        : "https://exp.host/--/api/v2/push/send",
      receipt
        ? { ids: [claim.ticket] }
        : {
            to: claim.token,
            title: "Тренировочный блокнот",
            body,
            sound: "default",
            channelId: "default",
            data: {
              version: 1,
              notificationId: claim.notificationId,
              workspaceId: claim.workspaceId,
            },
          },
    );
    if (result.status === 429)
      return { outcome: "retry", error: "transport_rejected" };
    if (result.status !== 200)
      return receipt
        ? { outcome: "retry", error: "receipt_unavailable" }
        : result.status >= 500
          ? { outcome: "unknown", error: "send_outcome_unknown" }
          : { outcome: "failed", error: "transport_rejected" };
    const data = object(result.body) ? result.body.data : null;
    return responseOutcome(
      receipt
        ? object(data)
          ? data[claim.ticket!]
          : null
        : Array.isArray(data)
          ? data.length === 1
            ? data[0]
            : null
          : data,
      receipt,
    );
  } catch {
    return {
      outcome: receipt ? "retry" : "unknown",
      error: receipt ? "receipt_unavailable" : "send_outcome_unknown",
    };
  }
}
export async function runPush(
  store: PushStore,
  transport: Transport,
  now: Date,
  morning: string,
  limit = 20,
) {
  if (
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(morning) ||
    !Number.isFinite(now.getTime()) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 20
  )
    throw new Error("Invalid push run configuration");
  await store.schedule(now.toISOString(), morning);
  const claims = await store.claim(limit);
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(5, claims.length) }, async () => {
      while (index < claims.length) {
        const claim = claims[index++]!;
        await store.complete(claim, await deliver(claim, transport));
      }
    }),
  );
  return { processed: claims.length };
}
