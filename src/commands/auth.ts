import type { Command } from "commander";
import { unwrapResult, VERSION_HEADER } from "../api/client";
import { configPath, readConfig, writeConfig } from "../config";
import {
  requireApiKey,
  type ActionRunner,
  type CommandContext,
} from "../lib/context";
import { UsageError } from "../lib/errors";
import { maskApiKey } from "../lib/helpers";
import { note, printJson, renderRecord } from "../lib/output";

export async function fetchViewer(context: CommandContext, apiKey: string) {
  const client = context.clientFactory({ apiKey });
  return unwrapResult(() => client.GET("/me", { params: { header: VERSION_HEADER } }));
}

type Viewer = Awaited<ReturnType<typeof fetchViewer>>;

export async function loginCommand(context: CommandContext): Promise<void> {
  // Only an explicit --api-key is stored; an ambient env/config key prompts instead.
  const flagKey = context.apiKey?.source === "flag" ? context.apiKey.key : null;
  const key = flagKey ?? (context.isInteractive ? await context.promptSecret("Paste your Raster API key") : null);
  if (!key) {
    throw new UsageError("Provide a key with --api-key, or run `raster auth login` in an interactive terminal.");
  }
  const viewer = await fetchViewer(context, key);
  const config = await readConfig(context.env);
  // Cache the key's scope so later commands skip the /me round-trip.
  await writeConfig(
    {
      ...config,
      apiKey: key,
      organizationId: viewer?.organizationId,
      libraries: (viewer?.libraries ?? []).filter((library): library is string => typeof library === "string"),
    },
    context.env,
  );
  if (context.json) {
    printJson(context, viewer);
    return;
  }
  const organizationLabel = viewer?.organizationName ?? viewer?.organizationId ?? "your organization";
  note(context, `Logged in to ${organizationLabel} as ${maskApiKey(key)}. Key stored in ${configPath(context.env)}.`);
}

export async function logoutCommand(context: CommandContext): Promise<void> {
  const config = await readConfig(context.env);
  delete config.apiKey;
  await writeConfig(config, context.env);
  note(context, "Logged out. Stored API key removed.");
}

export async function statusCommand(context: CommandContext): Promise<void> {
  if (!context.apiKey) {
    if (context.json) {
      printJson(context, { authenticated: false });
      return;
    }
    note(context, "Not authenticated. Run `raster auth login` or set RASTER_API_KEY.");
    return;
  }
  const { key, source } = context.apiKey;
  let viewer: Viewer | null = null;
  let failureMessage: string | null = null;
  try {
    viewer = await fetchViewer(context, key);
  } catch (error) {
    failureMessage = error instanceof Error ? error.message : String(error);
  }
  if (context.json) {
    printJson(context, {
      authenticated: true,
      source,
      keyPrefix: maskApiKey(key),
      organization: viewer ?? null,
    });
    return;
  }
  note(context, `API key ${maskApiKey(key)} (from ${source}).`);
  if (viewer) {
    note(context, `Organization: ${viewer.organizationName ?? viewer.organizationId ?? "unknown"} · plan: ${viewer.plan ?? "unknown"}`);
    return;
  }
  note(context, `Could not validate the key against the API: ${failureMessage ?? "unknown error"}`);
}

export async function whoamiCommand(context: CommandContext): Promise<void> {
  const { key } = requireApiKey(context);
  const viewer = await fetchViewer(context, key);
  if (context.json) {
    printJson(context, viewer);
    return;
  }
  renderRecord(context, [
    { label: "organization", value: viewer?.organizationId ?? "" },
    { label: "name", value: viewer?.organizationName ?? "" },
    { label: "plan", value: viewer?.plan ?? "" },
    { label: "libraries", value: (viewer?.libraries ?? []).join(", ") },
  ]);
}

export function registerAuthCommands(program: Command, runAction: ActionRunner): void {
  const auth = program.command("auth").description("Manage CLI authentication");
  auth
    .command("login")
    .description("Validate an API key against the API and store it (pass --api-key, or run interactively to be prompted)")
    .action((_options, command: Command) => runAction(command, (context) => loginCommand(context)));
  auth
    .command("logout")
    .description("Remove the stored API key")
    .action((_options, command: Command) => runAction(command, (context) => logoutCommand(context)));
  auth
    .command("status")
    .description("Show which API key is in use and where it came from")
    .action((_options, command: Command) => runAction(command, (context) => statusCommand(context)));
  program
    .command("whoami")
    .description("Show the organization and libraries the API key can access")
    .action((_options, command: Command) => runAction(command, (context) => whoamiCommand(context)));
}
