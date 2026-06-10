import { describe, expect, test } from "bun:test";
import { ApiError, EXIT_CODES, NetworkError, UsageError } from "../lib/errors";
import {
  buildRequestHeaders,
  parseEnvelope,
  unwrapResult,
  validateBaseUrl,
} from "./client";
import { API_VERSION } from "./version";
import { jsonResponse } from "../test-support";

describe("validateBaseUrl", () => {
  test("Req 3.3: accepts https on a raster.app host", () => {
    expect(validateBaseUrl("https://api.raster.app")).toBe("https://api.raster.app");
    expect(validateBaseUrl("https://staging.raster.app")).toBe("https://staging.raster.app");
  });

  test("Req 3.3: strips trailing slashes", () => {
    expect(validateBaseUrl("https://api.raster.app/")).toBe("https://api.raster.app");
  });

  test("Req 3.3: accepts localhost and 127.0.0.1 over http", () => {
    expect(validateBaseUrl("http://localhost:4000")).toBe("http://localhost:4000");
    expect(validateBaseUrl("http://127.0.0.1:4000")).toBe("http://127.0.0.1:4000");
  });

  test("Req 3.3: rejects http for raster hosts", () => {
    expect(() => validateBaseUrl("http://api.raster.app")).toThrow(UsageError);
  });

  test("Req 3.3: rejects non-raster https hosts", () => {
    expect(() => validateBaseUrl("https://evil.example.com")).toThrow(UsageError);
  });

  test("Req 3.3: rejects raster.app lookalike hosts", () => {
    expect(() => validateBaseUrl("https://raster.app.evil.com")).toThrow(UsageError);
  });

  test("Req 3.3: rejects unparseable URLs", () => {
    expect(() => validateBaseUrl("not a url")).toThrow(UsageError);
  });
});

describe("buildRequestHeaders", () => {
  test("Req 3.1: always carries the pinned Api-Version", () => {
    expect(buildRequestHeaders(null)["Api-Version"]).toBe(API_VERSION);
  });

  test("Req 3.2: carries Bearer auth only when a key is given", () => {
    expect(buildRequestHeaders("pk_x").Authorization).toBe("Bearer pk_x");
    expect(buildRequestHeaders(null).Authorization).toBeUndefined();
  });
});

describe("parseEnvelope", () => {
  test("Req 3.4: unwraps the { data } success envelope", async () => {
    const payload = await parseEnvelope(jsonResponse(200, { data: { id: "a1" } }));
    expect(payload).toEqual({ id: "a1" });
  });

  test("Req 3.4: turns the { error } envelope into an ApiError", async () => {
    const promise = parseEnvelope(jsonResponse(413, { error: { code: "PAYLOAD_TOO_LARGE", message: "File too large." } }));
    expect(promise).rejects.toThrow(ApiError);
    try {
      await parseEnvelope(jsonResponse(413, { error: { code: "PAYLOAD_TOO_LARGE", message: "File too large." } }));
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      // Req 6.2: 413 surfaces the API message and exits with the payload code.
      expect(error.exitCode).toBe(EXIT_CODES.payloadTooLarge);
      expect(error.message).toBe("File too large.");
    }
  });

  test("Req 3.4: a non-ok response without an envelope still fails", async () => {
    expect(parseEnvelope(new Response("oops", { status: 500 }))).rejects.toThrow(ApiError);
  });
});

describe("unwrapResult", () => {
  test("Req 3.4: returns the inner data payload", async () => {
    const payload = await unwrapResult(async () => ({
      data: { data: { id: "a1" } },
      response: new Response(null, { status: 200 }),
    }));
    expect(payload).toEqual({ id: "a1" });
  });

  test("Req 3.4: maps the error envelope to an ApiError with the HTTP status", async () => {
    const call = unwrapResult(async () => ({
      error: { error: { code: "UNAUTHENTICATED", message: "Invalid API key." } },
      response: new Response(null, { status: 401 }),
    }));
    expect(call).rejects.toThrow("Invalid API key.");
  });

  test("Req 8.5: transport failures become NetworkError (exit 7)", async () => {
    const call = unwrapResult(async () => {
      throw new TypeError("fetch failed");
    });
    expect(call).rejects.toThrow(NetworkError);
  });
});
