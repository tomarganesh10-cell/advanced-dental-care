/**
 * Application error taxonomy.
 *
 * Every error surfaced to a client goes through one of these. The rule is that
 * `message` is safe to show a user and `details` is safe to show a user — the
 * underlying exception, stack and database error never leave the server.
 */

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;
  /** True when the message is written for an end user rather than a developer. */
  readonly isPublic: boolean;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      details?: Record<string, unknown>;
      isPublic?: boolean;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.status = options.status ?? 500;
    this.code = options.code ?? "INTERNAL_ERROR";
    this.details = options.details;
    this.isPublic = options.isPublic ?? true;
  }
}

export class ValidationError extends AppError {
  constructor(message = "The submitted details are not valid.", details?: Record<string, unknown>) {
    super(message, { status: 422, code: "VALIDATION_ERROR", details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "You need to sign in to continue.") {
    super(message, { status: 401, code: "UNAUTHORIZED" });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super(message, { status: 403, code: "FORBIDDEN" });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found.") {
    super(message, { status: 404, code: "NOT_FOUND" });
  }
}

export class ConflictError extends AppError {
  constructor(message = "That conflicts with something that already exists.", details?: Record<string, unknown>) {
    super(message, { status: 409, code: "CONFLICT", details });
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, message = "Too many attempts. Please try again shortly.") {
    super(message, { status: 429, code: "RATE_LIMITED", details: { retryAfterSeconds } });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** A slot was taken between the patient seeing it and submitting. */
export class SlotUnavailableError extends ConflictError {
  constructor(message = "That time has just been taken. Please choose another slot.") {
    super(message);
  }
}
