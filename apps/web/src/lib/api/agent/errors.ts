export class AgentApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "AgentApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function unauthenticated(message = "Authentication required."): AgentApiError {
  return new AgentApiError(401, "UNAUTHENTICATED", message);
}

export function permissionDenied(scope: string): AgentApiError {
  return new AgentApiError(
    403,
    "PERMISSION_DENIED",
    `This key cannot perform this operation. Required scope: ${scope}.`,
    { required_scope: scope },
  );
}

export function notFound(code: string, message: string, details?: Record<string, unknown>) {
  return new AgentApiError(404, code, message, details);
}

export function conflict(code: string, message: string, details?: Record<string, unknown>) {
  return new AgentApiError(409, code, message, details);
}

export function validationError(message: string, details?: Record<string, unknown>) {
  return new AgentApiError(422, "VALIDATION_ERROR", message, details);
}
