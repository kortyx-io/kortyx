export class TelemetryDbError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

export class TelemetryAuthError extends TelemetryDbError {
  constructor(message = "Invalid telemetry API key.") {
    super(message, "TELEMETRY_AUTH_ERROR");
  }
}

export class TelemetryValidationError extends TelemetryDbError {
  constructor(message: string) {
    super(message, "TELEMETRY_VALIDATION_ERROR");
  }
}

export class TelemetryForbiddenError extends TelemetryDbError {
  constructor(message: string) {
    super(message, "TELEMETRY_FORBIDDEN");
  }
}

export class TelemetryNotFoundError extends TelemetryDbError {
  constructor(message: string) {
    super(message, "TELEMETRY_NOT_FOUND");
  }
}
