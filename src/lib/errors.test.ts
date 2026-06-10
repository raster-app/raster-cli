import { describe, expect, test } from "bun:test";
import {
  ApiError,
  AuthSetupError,
  EXIT_CODES,
  exitCodeForStatus,
  NetworkError,
  UsageError,
  ValidationError,
} from "./errors";

describe("exitCodeForStatus", () => {
  // Req 8.5: stable exit-code mapping.
  const cases: Array<[number, number]> = [
    [401, EXIT_CODES.auth],
    [403, EXIT_CODES.auth],
    [404, EXIT_CODES.notFound],
    [400, EXIT_CODES.validation],
    [409, EXIT_CODES.validation],
    [413, EXIT_CODES.payloadTooLarge],
    [500, EXIT_CODES.generic],
    [418, EXIT_CODES.generic],
  ];
  for (const [status, expected] of cases) {
    test(`Req 8.5: HTTP ${status} maps to exit code ${expected}`, () => {
      expect(exitCodeForStatus(status)).toBe(expected);
    });
  }
});

describe("error classes", () => {
  test("Req 8.5: error subclasses carry their exit codes", () => {
    expect(new UsageError("u").exitCode).toBe(EXIT_CODES.usage);
    expect(new AuthSetupError("a").exitCode).toBe(EXIT_CODES.auth);
    expect(new ValidationError("v").exitCode).toBe(EXIT_CODES.validation);
    expect(new NetworkError("n").exitCode).toBe(EXIT_CODES.network);
  });

  test("Req 8.5: ApiError derives its exit code from the HTTP status", () => {
    const error = new ApiError("PAYLOAD_TOO_LARGE", "File exceeds the limit.", 413);
    expect(error.exitCode).toBe(EXIT_CODES.payloadTooLarge);
    expect(error.code).toBe("PAYLOAD_TOO_LARGE");
    expect(error.status).toBe(413);
  });
});
