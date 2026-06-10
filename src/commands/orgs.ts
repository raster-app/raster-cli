import type { Command } from "commander";
import { z } from "zod";
import { unwrapResult, VERSION_HEADER } from "../api/client";
import { configPath, readConfig, writeConfig } from "../config";
import { parseOptions, type ActionRunner, type CommandContext } from "../lib/context";
import { maskApiKey } from "../lib/helpers";
import { note, printJson, renderRecord } from "../lib/output";

const createOptionsSchema = z.object({
  email: z.email(),
  name: z.string().min(1).optional(),
  save: z.boolean().default(false),
});

export async function createOrganizationCommand(
  context: CommandContext,
  options: z.infer<typeof createOptionsSchema>,
): Promise<void> {
  const client = context.clientFactory({ apiKey: null });
  const created = await unwrapResult(() =>
    client.POST("/libraries", {
      params: { header: VERSION_HEADER },
      body: { email: options.email, name: options.name },
    }),
  );
  if (context.json) {
    printJson(context, created);
  } else {
    renderRecord(context, [
      { label: "organization", value: created.organizationId ?? "" },
      { label: "library", value: created.libraryId ?? "" },
      { label: "claim URL", value: created.claimUrl ?? "" },
      { label: "expires", value: created.expiresAt ?? "" },
      { label: "email sent", value: String(created.emailSent ?? false) },
    ]);
  }
  const mintedKey = created.apiKey;
  if (typeof mintedKey !== "string" || mintedKey.length === 0) return;
  const shouldStore =
    options.save ||
    (!context.json &&
      context.isInteractive &&
      (await context.confirm("Store the new API key in the CLI config?")));
  if (shouldStore) {
    const config = await readConfig(context.env);
    await writeConfig({ ...config, apiKey: mintedKey }, context.env);
    note(context, `Stored API key ${maskApiKey(mintedKey)} in ${configPath(context.env)}.`);
    return;
  }
  if (!context.json) {
    note(context, "API key not stored. Re-run with --save, or use --json to capture it.");
  }
}

export function registerOrgCommands(program: Command, runAction: ActionRunner): void {
  const orgs = program.command("orgs").description("Work with organizations");
  orgs
    .command("create")
    .description("Create a library with no account (held for 30 days until claimed)")
    .requiredOption("--email <email>", "Email that receives the claim link")
    .option("--name <name>", "Library name")
    .option("--save", "Store the minted API key in the CLI config")
    .action((options, command: Command) =>
      runAction(command, (context) =>
        createOrganizationCommand(context, parseOptions(createOptionsSchema, options)),
      ),
    );
}
