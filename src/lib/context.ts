import type { Command } from "commander";
import { z } from "zod";
import { createApiClient, validateBaseUrl, type ApiClient, type FetchLike } from "../api/client";
import { DEFAULT_BASE_URL } from "../api/version";
import { readConfig, resolveApiKey, type ResolvedApiKey } from "../config";
import { ApiError, AuthSetupError, CliError, EXIT_CODES, UsageError } from "./errors";
import { maskApiKey } from "./helpers";
import { note, printJson, verboseLog, type OutputContext } from "./output";
import { promptConfirm, promptSecret } from "./prompts";

export type CommandContext = OutputContext & {
  env: NodeJS.ProcessEnv;
  isInteractive: boolean;
  apiKey: ResolvedApiKey | null;
  baseUrl: string;
  fetch: FetchLike;
  clientFactory: (overrides?: { apiKey: string | null }) => ApiClient;
  confirm: (message: string) => Promise<boolean>;
  promptSecret: (message: string) => Promise<string | null>;
};

export type GlobalOptions = {
  apiKey?: string | undefined;
  json?: boolean | undefined;
  verbose?: boolean | undefined;
};

export type ContextOverrides = {
  env?: NodeJS.ProcessEnv;
  fetch?: FetchLike;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  isInteractive?: boolean;
  confirm?: (message: string) => Promise<boolean>;
  promptSecret?: (message: string) => Promise<string | null>;
};

export async function createCommandContext(
  globals: GlobalOptions,
  overrides: ContextOverrides = {},
): Promise<CommandContext> {
  const env = overrides.env ?? process.env;
  const config = await readConfig(env);
  const apiKey = resolveApiKey({ flagKey: globals.apiKey, env, config });
  const output: OutputContext = {
    json: globals.json === true,
    verbose: globals.verbose === true,
    stdout: overrides.stdout ?? ((text: string) => void process.stdout.write(text)),
    stderr: overrides.stderr ?? ((text: string) => void process.stderr.write(text)),
  };
  const baseUrl = validateBaseUrl(env.RASTER_API_BASE_URL ?? DEFAULT_BASE_URL);
  const baseFetch = overrides.fetch ?? globalThis.fetch;
  const instrumentedFetch = instrumentFetch(baseFetch, output, apiKey ? maskApiKey(apiKey.key) : null);
  return {
    ...output,
    env,
    baseUrl,
    isInteractive: overrides.isInteractive ?? process.stdin.isTTY === true,
    apiKey,
    fetch: instrumentedFetch,
    clientFactory: (clientOverrides) =>
      createApiClient({
        baseUrl,
        apiKey: clientOverrides ? clientOverrides.apiKey : (apiKey?.key ?? null),
        fetch: instrumentedFetch,
      }),
    confirm: overrides.confirm ?? promptConfirm,
    promptSecret: overrides.promptSecret ?? promptSecret,
  };
}

function instrumentFetch(
  baseFetch: FetchLike,
  output: OutputContext,
  maskedKey: string | null,
): FetchLike {
  return async (input, init) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(request.url);
    const startedAt = performance.now();
    try {
      const response = await baseFetch(request);
      verboseLog(
        output,
        `${request.method} ${url.pathname} key=${maskedKey ?? "none"} status=${response.status} duration=${Math.round(performance.now() - startedAt)}ms`,
      );
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      verboseLog(output, `${request.method} ${url.pathname} key=${maskedKey ?? "none"} failed=${message}`);
      throw error;
    }
  };
}

export function requireApiKey(context: CommandContext): ResolvedApiKey {
  if (context.apiKey) return context.apiKey;
  throw new AuthSetupError("No API key found. Run `raster auth login` or set RASTER_API_KEY.");
}

export async function executeCommand(context: CommandContext, action: () => Promise<void>): Promise<number> {
  try {
    await action();
    return EXIT_CODES.success;
  } catch (error) {
    if (error instanceof ApiError) {
      if (context.json) printJson(context, { error: { code: error.code, message: error.message } });
      note(context, error.message);
      return error.exitCode;
    }
    if (error instanceof CliError) {
      note(context, error.message);
      return error.exitCode;
    }
    if (error instanceof Error) {
      note(context, context.verbose && error.stack ? error.stack : `Unexpected error: ${error.message}`);
      return EXIT_CODES.generic;
    }
    note(context, `Unexpected error: ${String(error)}`);
    return EXIT_CODES.generic;
  }
}

export function parseOptions<Schema extends z.ZodType>(schema: Schema, raw: unknown): z.infer<Schema> {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  throw new UsageError(result.error.issues.map((issue) => issue.message).join("; "));
}

export type ActionRunner = (
  command: Command,
  handler: (context: CommandContext) => Promise<void>,
) => Promise<void>;
