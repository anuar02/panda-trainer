import {
  APIError,
  AuthenticationError,
  BadInputError,
  CredentialsMissedError,
  NotEnoughCreditsError,
  TimeoutError,
  ValidationError,
} from "@higgsfield/client/v2";

export const ExitCode = {
  OK: 0,
  ERROR: 1,
  USAGE: 2,
  AUTH: 3,
  CREDITS: 4,
  RATE_LIMIT: 5,
  TIMEOUT: 6,
  GENERATION_FAILED: 7,
  NOT_FOUND: 8,
} as const;

export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number = ExitCode.ERROR) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export function usageError(message: string): CliError {
  return new CliError(message, ExitCode.USAGE);
}

function detailOf(error: APIError): string {
  const data = error.responseData;
  if (data && typeof data === "object" && "detail" in data) {
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) => (item as { msg?: string })?.msg ?? JSON.stringify(item))
        .join("; ");
    }
  }
  return error.message;
}

export function mapApiError(error: unknown): CliError {
  if (error instanceof CliError) return error;
  if (error instanceof CredentialsMissedError) {
    return new CliError(
      "Missing Higgsfield credentials. Set HF_CREDENTIALS=key-id:key-secret in .env.local.",
      ExitCode.AUTH,
    );
  }
  if (error instanceof AuthenticationError) {
    return new CliError("Higgsfield rejected the credentials (401).", ExitCode.AUTH);
  }
  if (error instanceof NotEnoughCreditsError) {
    return new CliError("Insufficient credits on the Higgsfield account (403).", ExitCode.CREDITS);
  }
  if (error instanceof TimeoutError) {
    return new CliError(error.message, ExitCode.TIMEOUT);
  }
  if (error instanceof ValidationError) {
    return usageError(`Invalid request: ${detailOf(error)}`);
  }
  if (error instanceof BadInputError) {
    const detail = detailOf(error);
    if (/concurrent/i.test(detail)) {
      return new CliError(
        `${detail} Wait for an in-flight request to finish, then retry.`,
        ExitCode.RATE_LIMIT,
      );
    }
    return usageError(detail);
  }
  if (error instanceof APIError) {
    const status = error.statusCode;
    if (status === 401) return new CliError("Higgsfield rejected the credentials (401).", ExitCode.AUTH);
    if (status === 403) return new CliError("Insufficient credits (403).", ExitCode.CREDITS);
    if (status === 404) return new CliError(detailOf(error), ExitCode.NOT_FOUND);
    return new CliError(detailOf(error), ExitCode.ERROR);
  }
  return new CliError(error instanceof Error ? error.message : String(error), ExitCode.ERROR);
}
