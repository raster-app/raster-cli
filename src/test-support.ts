import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FetchLike } from "./api/client";
import { createCommandContext, type CommandContext } from "./lib/context";

// Reserved .test TLD (RFC 6761) — never resolves; all fetches here are mocked.
export const TEST_BASE_URL = "https://api.raster.app";
export const TEST_API_KEY = `pk_${"a".repeat(45)}`;

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function dataEnvelope(payload: unknown): { data: unknown } {
  return { data: payload };
}

export function errorEnvelopeBody(code: string, message: string): { error: { code: string; message: string } } {
  return { error: { code, message } };
}

export type MockRoute = (request: Request) => Response | null;

// Minimal structural view of a recorded request — sidesteps the Bun/undici
// global Request type mismatch while keeping everything the tests inspect.
export type RecordedRequest = {
  method: string;
  url: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  formData(): Promise<{ getAll(name: string): unknown[] }>;
};

export function jsonRoute(method: string, pathname: string, status: number, body: unknown): MockRoute {
  return (request) => {
    const url = new URL(request.url);
    if (request.method !== method || url.pathname !== pathname) return null;
    return jsonResponse(status, body);
  };
}

export function rawRoute(method: string, pathname: string, build: () => Response): MockRoute {
  return (request) => {
    const url = new URL(request.url);
    if (request.method !== method || url.pathname !== pathname) return null;
    return build();
  };
}

export function createMockFetch(...routes: MockRoute[]): { fetchImpl: FetchLike; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    requests.push(request.clone());
    for (const route of routes) {
      const response = route(request);
      if (response) return response;
    }
    return jsonResponse(404, errorEnvelopeBody("RESOURCE_NOT_FOUND", "No mock route matched."));
  };
  return { fetchImpl, requests };
}

export async function createTestEnv(extra: Record<string, string> = {}): Promise<NodeJS.ProcessEnv> {
  const configHome = await mkdtemp(join(tmpdir(), "raster-cli-test-"));
  return { RASTER_CONFIG_HOME: configHome, RASTER_API_BASE_URL: TEST_BASE_URL, ...extra };
}

export type TestContextOptions = {
  env?: NodeJS.ProcessEnv;
  fetch?: FetchLike;
  json?: boolean;
  verbose?: boolean;
  flagApiKey?: string;
  org?: string;
  library?: string;
  isInteractive?: boolean;
  confirm?: (message: string) => Promise<boolean>;
  promptSecret?: (message: string) => Promise<string | null>;
};

export type TestContext = {
  context: CommandContext;
  stdoutLines: string[];
  stderrLines: string[];
  env: NodeJS.ProcessEnv;
};

export async function createTestContext(options: TestContextOptions = {}): Promise<TestContext> {
  const env = options.env ?? (await createTestEnv());
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  const context = await createCommandContext(
    {
      apiKey: options.flagApiKey,
      org: options.org,
      library: options.library,
      json: options.json,
      verbose: options.verbose,
    },
    {
      env,
      fetch: options.fetch,
      stdout: (text) => {
        stdoutLines.push(text);
      },
      stderr: (text) => {
        stderrLines.push(text);
      },
      isInteractive: options.isInteractive ?? false,
      confirm: options.confirm ?? (async () => true),
      promptSecret: options.promptSecret ?? (async () => null),
    },
  );
  return { context, stdoutLines, stderrLines, env };
}
