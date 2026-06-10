import createClient from "openapi-fetch";
import { z } from "zod";
import { ApiError, NetworkError, UsageError } from "../lib/errors";
import type { paths } from "./openapi";
import { API_VERSION, DEFAULT_BASE_URL } from "./version";

export const VERSION_HEADER = { "Api-Version": API_VERSION } as const;

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

export function validateBaseUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UsageError(`Invalid API base URL: ${rawUrl}`);
  }
  if (parsed.protocol !== "https:" && !LOCAL_HOSTNAMES.has(parsed.hostname)) {
    throw new UsageError(
      `API base URL must use https (got ${rawUrl}). localhost and 127.0.0.1 are the only http exceptions.`,
    );
  }
  return rawUrl.replace(/\/+$/, "");
}

export function buildRequestHeaders(apiKey: string | null): Record<string, string> {
  const headers: Record<string, string> = { "Api-Version": API_VERSION };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type ApiClientOptions = {
  baseUrl?: string;
  apiKey?: string | null;
  fetch?: FetchLike;
};

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = validateBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
  const client = createClient<paths>({ baseUrl, fetch: options.fetch });
  client.use({
    onRequest({ request }) {
      for (const [name, value] of Object.entries(buildRequestHeaders(options.apiKey ?? null))) {
        request.headers.set(name, value);
      }
      return request;
    },
  });
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;

const errorEnvelopeSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
const dataEnvelopeSchema = z.object({ data: z.unknown() });

type FetchResult<T> = {
  data?: { data: T };
  error?: unknown;
  response: Response;
};

export async function unwrapResult<T>(call: () => Promise<FetchResult<T>>): Promise<T> {
  let result: FetchResult<T>;
  try {
    result = await call();
  } catch (error) {
    throw toNetworkError(error);
  }
  if (result.data !== undefined) return result.data.data;
  throw toApiError(result.error, result.response.status);
}

export async function parseEnvelope(response: Response): Promise<unknown> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const errorEnvelope = errorEnvelopeSchema.safeParse(body);
  if (errorEnvelope.success) {
    throw new ApiError(errorEnvelope.data.error.code, errorEnvelope.data.error.message, response.status);
  }
  if (!response.ok) {
    throw new ApiError("UNKNOWN", `Request failed with HTTP ${response.status}.`, response.status);
  }
  const dataEnvelope = dataEnvelopeSchema.safeParse(body);
  if (dataEnvelope.success) return dataEnvelope.data.data;
  throw new ApiError("UNKNOWN", "Response did not match the { data } envelope.", response.status);
}

function toApiError(errorBody: unknown, status: number): ApiError {
  const parsed = errorEnvelopeSchema.safeParse(errorBody);
  if (parsed.success) return new ApiError(parsed.data.error.code, parsed.data.error.message, status);
  return new ApiError("UNKNOWN", `Request failed with HTTP ${status}.`, status);
}

function toNetworkError(error: unknown): NetworkError {
  const message = error instanceof Error ? error.message : String(error);
  return new NetworkError(`Could not reach the API: ${message}`);
}
