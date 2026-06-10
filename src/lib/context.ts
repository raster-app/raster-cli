import type { Command } from "commander";
import { z } from "zod";
import {
  createApiClient,
  unwrapResult,
  validateBaseUrl,
  VERSION_HEADER,
  type ApiClient,
  type FetchLike,
} from "../api/client";
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
  // Resolve the target org/library from --org/--library, else the scope cached at
  // login, else one /me fallback. resolveLibrary requires --library when the key
  // spans many.
  resolveOrg: () => Promise<string>;
  resolveLibrary: () => Promise<string>;
  // Raw --library, undefined when omitted — for org-wide commands (search) that
  // treat a library as an optional filter rather than a required target.
  explicitLibrary: string | undefined;
};

export type GlobalOptions = {
  apiKey?: string | undefined;
  org?: string | undefined;
  library?: string | undefined;
  json?: boolean | undefined;
  verbose?: boolean | undefined;
};

type Viewer = {
  organizationId?: string;
  organizationName?: string | null;
  plan?: string | null;
  libraries?: Array<string | null>;
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
  const clientFactory = (clientOverrides?: { apiKey: string | null }): ApiClient =>
    createApiClient({
      baseUrl,
      apiKey: clientOverrides ? clientOverrides.apiKey : (apiKey?.key ?? null),
      fetch: instrumentedFetch,
    });
  // One /me lookup per run, shared by org and library resolution.
  let viewerPromise: Promise<Viewer> | null = null;
  const loadViewer = (): Promise<Viewer> => {
    if (!viewerPromise) {
      if (!apiKey) {
        throw new AuthSetupError("No API key found. Run `raster auth login` or set RASTER_API_KEY.");
      }
      viewerPromise = unwrapResult(() =>
        clientFactory({ apiKey: apiKey.key }).GET("/me", { params: { header: VERSION_HEADER } }),
      );
    }
    return viewerPromise;
  };
  // The cached scope belongs to one key; ignore it when a different key is active.
  const cacheMatchesKey = config.apiKey !== undefined && apiKey?.key === config.apiKey;
  return {
    ...output,
    env,
    baseUrl,
    isInteractive: overrides.isInteractive ?? process.stdin.isTTY === true,
    apiKey,
    fetch: instrumentedFetch,
    clientFactory,
    confirm: overrides.confirm ?? promptConfirm,
    promptSecret: overrides.promptSecret ?? promptSecret,
    explicitLibrary: globals.library,
    resolveOrg: async () => {
      if (globals.org) return globals.org;
      // The org is immutable per key, so the cached value is always valid for it.
      if (cacheMatchesKey && config.organizationId) return config.organizationId;
      const viewer = await loadViewer();
      if (!viewer.organizationId) {
        throw new CliError("Could not determine the organization from the API key.", EXIT_CODES.generic);
      }
      return viewer.organizationId;
    },
    resolveLibrary: async () => {
      if (globals.library) return globals.library;
      // Library access can change after login; the cache is a hint and the API
      // is the enforcer. Re-run `auth login` to refresh, or pass --library.
      const cachedLibraries = cacheMatchesKey ? config.libraries : undefined;
      const source = cachedLibraries ?? (await loadViewer()).libraries ?? [];
      const libraries = source.filter((value): value is string => typeof value === "string");
      const onlyLibrary = libraries[0];
      if (libraries.length === 1 && onlyLibrary) return onlyLibrary;
      if (libraries.length === 0) {
        throw new AuthSetupError("The API key has no library access.");
      }
      throw new UsageError(
        `The API key can access ${libraries.length} libraries (${libraries.join(", ")}). Pass --library <id>.`,
      );
    },
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
