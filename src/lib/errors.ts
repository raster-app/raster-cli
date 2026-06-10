export const EXIT_CODES = {
  success: 0,
  generic: 1,
  usage: 2,
  auth: 3,
  notFound: 4,
  validation: 5,
  payloadTooLarge: 6,
  network: 7,
} as const;

export function exitCodeForStatus(status: number): number {
  if (status === 401 || status === 403) return EXIT_CODES.auth;
  if (status === 404) return EXIT_CODES.notFound;
  if (status === 400 || status === 409) return EXIT_CODES.validation;
  if (status === 413) return EXIT_CODES.payloadTooLarge;
  return EXIT_CODES.generic;
}

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UsageError extends CliError {
  constructor(message: string) {
    super(message, EXIT_CODES.usage);
  }
}

export class AuthSetupError extends CliError {
  constructor(message: string) {
    super(message, EXIT_CODES.auth);
  }
}

export class ValidationError extends CliError {
  constructor(message: string) {
    super(message, EXIT_CODES.validation);
  }
}

export class NetworkError extends CliError {
  constructor(message: string) {
    super(message, EXIT_CODES.network);
  }
}

export class ApiError extends CliError {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message, exitCodeForStatus(status));
  }
}
