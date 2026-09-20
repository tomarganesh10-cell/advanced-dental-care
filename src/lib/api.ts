import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, RateLimitError } from "./errors";
import { logger } from "./logger";
import { isProduction } from "./env";

/**
 * API response envelope and error handling.
 *
 * One shape for every response so clients never have to guess. The critical
 * behaviour is in `toErrorResponse`: an unrecognised exception becomes a
 * generic 500 with a request id, and the actual message, stack and any database
 * detail stay in the server log. Echoing a Prisma error to the browser leaks
 * schema; echoing a stack leaks paths and package versions.
 */

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function apiSuccess<T>(data: T, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data }, init);
}

export function apiError(
  message: string,
  options: {
    status?: number;
    code?: string;
    details?: Record<string, unknown>;
    requestId?: string;
  } = {},
): NextResponse<ApiFailure> {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: options.code ?? "ERROR",
        message,
        details: options.details,
        requestId: options.requestId,
      },
    },
    { status: options.status ?? 400 },
  );
}

/** Flattens a Zod error into { fieldName: "message" } for form display. */
export function zodFieldErrors(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export function toErrorResponse(error: unknown, requestId: string): NextResponse<ApiFailure> {
  if (error instanceof ZodError) {
    return apiError("Please check the highlighted fields.", {
      status: 422,
      code: "VALIDATION_ERROR",
      details: { fields: zodFieldErrors(error) },
      requestId,
    });
  }

  if (error instanceof RateLimitError) {
    const response = apiError(error.message, {
      status: 429,
      code: error.code,
      details: error.details,
      requestId,
    });
    response.headers.set("Retry-After", String(error.retryAfterSeconds));
    return response;
  }

  if (error instanceof AppError) {
    // 5xx AppErrors are still unexpected enough to warrant a log line.
    if (error.status >= 500) {
      logger.error({ err: error.message, code: error.code, requestId }, "api error");
    }
    return apiError(error.message, {
      status: error.status,
      code: error.code,
      details: error.details,
      requestId,
    });
  }

  // Postgres serialisation failure from a SERIALIZABLE booking transaction.
  // This is contention, not a bug — tell the user to try again.
  const code = (error as { code?: string })?.code;
  if (code === "40001" || code === "P2034") {
    return apiError("That slot was being booked by someone else. Please try again.", {
      status: 409,
      code: "CONCURRENT_BOOKING",
      requestId,
    });
  }

  logger.error(
    {
      err: error instanceof Error ? error.message : String(error),
      stack: (error as Error)?.stack,
      requestId,
    },
    "unhandled api error",
  );

  return apiError(
    isProduction
      ? "Something went wrong at our end. Please try again, or call the clinic."
      : `Unhandled error: ${error instanceof Error ? error.message : String(error)}`,
    { status: 500, code: "INTERNAL_ERROR", requestId },
  );
}

export function newRequestId(): string {
  return crypto.randomUUID();
}

/** Wraps a route handler with error handling and a request id. */
export function withApiHandler<T>(
  handler: (request: Request, requestId: string) => Promise<NextResponse<ApiResponse<T>>>,
) {
  return async (request: Request): Promise<NextResponse<ApiResponse<T>>> => {
    const requestId = newRequestId();
    try {
      const response = await handler(request, requestId);
      response.headers.set("X-Request-Id", requestId);
      return response;
    } catch (error) {
      const response = toErrorResponse(error, requestId);
      response.headers.set("X-Request-Id", requestId);
      return response as NextResponse<ApiResponse<T>>;
    }
  };
}
