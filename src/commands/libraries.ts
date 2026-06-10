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
import { note, printJson, renderRecord, renderTable, type TableColumn } from "../lib/output";

type LibraryRecord = components["schemas"]["Library"];

const LIBRARY_COLUMNS: Array<TableColumn<LibraryRecord>> = [
  { header: "ID", value: (library) => library.id },
  { header: "NAME", value: (library) => library.name ?? "" },
  { header: "ASSETS", value: (library) => String(library.assetsCount ?? "") },
  { header: "TRASH", value: (library) => String(library.trashCount ?? "") },
  { header: "TAGS", value: (library) => String((library.tags ?? []).length) },
];

const listOptionsSchema = z.object({
  org: z.string().min(1),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
});

export async function listLibrariesCommand(
  context: CommandContext,
  options: z.infer<typeof listOptionsSchema>,
): Promise<void> {
  requireApiKey(context);
  const client = context.clientFactory();
  const libraries = await unwrapResult(() =>
    client.GET("/organizations/{organizationId}/libraries", {
      params: {
        path: { organizationId: options.org },
        header: VERSION_HEADER,
        query: { page: options.page, pageSize: options.pageSize },
      },
    }),
  );
  if (context.json) {
    printJson(context, libraries);
    return;
  }
  renderTable(context, libraries, LIBRARY_COLUMNS);
}

const createOptionsSchema = z.object({
  org: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1).optional(),
});

export async function createLibraryCommand(
  context: CommandContext,
  options: z.infer<typeof createOptionsSchema>,
): Promise<void> {
  requireApiKey(context);
  const client = context.clientFactory();
  const library = await unwrapResult(() =>
    client.POST("/organizations/{organizationId}/libraries", {
      params: { path: { organizationId: options.org }, header: VERSION_HEADER },
      body: { name: options.name, slug: options.slug },
    }),
  );
  if (context.json) {
    printJson(context, library);
    return;
  }
  renderRecord(context, [
    { label: "id", value: library.id },
    { label: "name", value: library.name ?? "" },
  ]);
  note(context, "Library created.");
}

const renameOptionsSchema = z.object({
  org: z.string().min(1),
  library: z.string().min(1),
  name: z.string().min(1),
});

export async function renameLibraryCommand(
  context: CommandContext,
  options: z.infer<typeof renameOptionsSchema>,
): Promise<void> {
  requireApiKey(context);
  const client = context.clientFactory();
  const library = await unwrapResult(() =>
    client.PATCH("/organizations/{organizationId}/libraries/{libraryId}", {
      params: {
        path: { organizationId: options.org, libraryId: options.library },
        header: VERSION_HEADER,
      },
      body: { name: options.name },
    }),
  );
  if (context.json) {
    printJson(context, library);
    return;
  }
  note(context, `Library renamed to ${library.name ?? options.name}.`);
}

export function registerLibraryCommands(program: Command, runAction: ActionRunner): void {
  const libraries = program.command("libraries").description("Work with libraries");
  libraries
    .command("ls")
    .description("List libraries in an organization")
    .requiredOption("--org <organizationId>", "Organization id")
    .option("--page <number>", "Page number (1-based)")
    .option("--page-size <number>", "Results per page")
    .action((options, command: Command) =>
      runAction(command, (context) => listLibrariesCommand(context, parseOptions(listOptionsSchema, options))),
    );
  libraries
    .command("create")
    .description("Create a library")
    .requiredOption("--org <organizationId>", "Organization id")
    .requiredOption("--name <name>", "Library name")
    .option("--slug <slug>", "URL slug for the library")
    .action((options, command: Command) =>
      runAction(command, (context) => createLibraryCommand(context, parseOptions(createOptionsSchema, options))),
    );
  libraries
    .command("rename")
    .description("Rename a library")
    .requiredOption("--org <organizationId>", "Organization id")
    .requiredOption("--library <libraryId>", "Library id")
    .requiredOption("--name <name>", "New library name")
    .action((options, command: Command) =>
      runAction(command, (context) => renameLibraryCommand(context, parseOptions(renameOptionsSchema, options))),
    );
}
