import type { Command } from "commander";
import { z } from "zod";
import { unwrapResult, VERSION_HEADER } from "../api/client";
import type { components } from "../api/openapi";
import {
  parseOptions,
  requireApiKey,
  type ActionRunner,
  type CommandContext,
} from "../lib/context";
import { UsageError } from "../lib/errors";
import { note, printJson, renderTable, type TableColumn } from "../lib/output";

type TagRecord = components["schemas"]["Tag"];

const TAG_COLUMNS: Array<TableColumn<TagRecord>> = [
  { header: "TAG", value: (tag) => tag.id },
  { header: "COUNT", value: (tag) => String(tag.count ?? "") },
  { header: "TYPE", value: (tag) => tag.type ?? "" },
];

const listOptionsSchema = z.object({
  limit: z.coerce.number().int().min(1).optional(),
});

export async function listTagsCommand(
  context: CommandContext,
  options: z.infer<typeof listOptionsSchema>,
): Promise<void> {
  requireApiKey(context);
  const organizationId = await context.resolveOrg();
  const libraryId = await context.resolveLibrary();
  const client = context.clientFactory();
  const tags = await unwrapResult(() =>
    client.GET("/organizations/{organizationId}/libraries/{libraryId}/tags", {
      params: {
        path: { organizationId, libraryId },
        header: VERSION_HEADER,
        query: { limit: options.limit },
      },
    }),
  );
  if (context.json) {
    printJson(context, tags);
    return;
  }
  renderTable(context, tags, TAG_COLUMNS);
}

const mutateOptionsSchema = z.object({
  tag: z.array(z.string().min(1)).min(1),
});

type TagMutationOptions = z.infer<typeof mutateOptionsSchema>;

export async function tagAssetsCommand(
  context: CommandContext,
  assetIds: string[],
  options: TagMutationOptions,
): Promise<void> {
  if (assetIds.length === 0) throw new UsageError("Provide at least one asset id.");
  requireApiKey(context);
  const organizationId = await context.resolveOrg();
  const libraryId = await context.resolveLibrary();
  const client = context.clientFactory();
  const result = await unwrapResult(() =>
    client.POST("/organizations/{organizationId}/libraries/{libraryId}/assets/tag", {
      params: { path: { organizationId, libraryId }, header: VERSION_HEADER },
      body: { assetIds, tags: options.tag },
    }),
  );
  if (context.json) {
    printJson(context, result);
    return;
  }
  note(context, `Tagged ${assetIds.length} asset(s) with ${options.tag.join(", ")}.`);
}

export async function untagAssetsCommand(
  context: CommandContext,
  assetIds: string[],
  options: TagMutationOptions,
): Promise<void> {
  if (assetIds.length === 0) throw new UsageError("Provide at least one asset id.");
  requireApiKey(context);
  const organizationId = await context.resolveOrg();
  const libraryId = await context.resolveLibrary();
  const client = context.clientFactory();
  const result = await unwrapResult(() =>
    client.POST("/organizations/{organizationId}/libraries/{libraryId}/assets/untag", {
      params: { path: { organizationId, libraryId }, header: VERSION_HEADER },
      body: { assetIds, tags: options.tag },
    }),
  );
  if (context.json) {
    printJson(context, result);
    return;
  }
  note(context, `Removed ${options.tag.join(", ")} from ${assetIds.length} asset(s).`);
}

export function registerTagCommands(program: Command, runAction: ActionRunner): void {
  const tags = program.command("tags").description("Work with tags in a library");
  tags
    .command("ls")
    .description("List tags in the library")
    .option("--limit <number>", "Maximum number of tags to return")
    .action((options, command: Command) =>
      runAction(command, (context) => listTagsCommand(context, parseOptions(listOptionsSchema, options))),
    );
  tags
    .command("add")
    .description("Add tags to assets")
    .argument("<assetIds...>", "Asset ids to tag")
    .requiredOption("--tag <tag...>", "Tags to add (repeatable)")
    .action((assetIds: string[], options, command: Command) =>
      runAction(command, (context) => tagAssetsCommand(context, assetIds, parseOptions(mutateOptionsSchema, options))),
    );
  tags
    .command("rm")
    .description("Remove tags from assets")
    .argument("<assetIds...>", "Asset ids to untag")
    .requiredOption("--tag <tag...>", "Tags to remove (repeatable)")
    .action((assetIds: string[], options, command: Command) =>
      runAction(command, (context) => untagAssetsCommand(context, assetIds, parseOptions(mutateOptionsSchema, options))),
    );
}
