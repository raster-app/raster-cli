import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import type { Command } from "commander";
import { z } from "zod";
import { buildRequestHeaders, parseEnvelope, unwrapResult, VERSION_HEADER } from "../api/client";
import type { components } from "../api/openapi";
import {
  parseOptions,
  requireApiKey,
  type ActionRunner,
  type CommandContext,
} from "../lib/context";
import { CliError, EXIT_CODES, NetworkError, UsageError, ValidationError } from "../lib/errors";
import {
  chunk,
  contentTypeForFilename,
  formatBytes,
  isErrnoException,
  MAX_DELETE_IDS,
  MAX_TAGS_PER_QUERY,
  MAX_UPLOAD_FILES,
} from "../lib/helpers";
import { note, printJson, renderRecord, renderTable, type TableColumn } from "../lib/output";

type AssetRecord = components["schemas"]["Asset"];
type SearchHitRecord = components["schemas"]["SearchHit"];

const ASSET_COLUMNS: Array<TableColumn<AssetRecord>> = [
  { header: "ID", value: (asset) => asset.id },
  { header: "NAME", value: (asset) => asset.name ?? "" },
  { header: "TYPE", value: (asset) => asset.contentType ?? "" },
  { header: "SIZE", value: (asset) => formatBytes(asset.size) },
  { header: "TAGS", value: (asset) => (asset.tags ?? []).filter((tag) => tag !== null).join(",") },
];

const SEARCH_HIT_COLUMNS: Array<TableColumn<SearchHitRecord>> = [
  { header: "ID", value: (hit) => hit.id },
  { header: "NAME", value: (hit) => hit.name ?? "" },
  { header: "LIBRARY", value: (hit) => hit.libraryId ?? "" },
];

const inLibraryOptionsSchema = z.object({
  org: z.string().min(1),
  library: z.string().min(1),
});

const listOptionsSchema = inLibraryOptionsSchema.extend({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
  tag: z.array(z.string().min(1)).default([]),
});

export async function listAssetsCommand(
  context: CommandContext,
  options: z.infer<typeof listOptionsSchema>,
): Promise<void> {
  if (options.tag.length > MAX_TAGS_PER_QUERY) {
    throw new ValidationError(`At most ${MAX_TAGS_PER_QUERY} --tag filters are supported per query.`);
  }
  requireApiKey(context);
  const client = context.clientFactory();
  const assets = await unwrapResult(() =>
    client.GET("/organizations/{organizationId}/libraries/{libraryId}/assets", {
      params: {
        path: { organizationId: options.org, libraryId: options.library },
        header: VERSION_HEADER,
        query: {
          page: options.page,
          pageSize: options.pageSize,
          tags: options.tag.length > 0 ? options.tag.join(",") : undefined,
        },
      },
    }),
  );
  if (context.json) {
    printJson(context, assets);
    return;
  }
  renderTable(context, assets, ASSET_COLUMNS);
}

const getOptionsSchema = inLibraryOptionsSchema;

export async function getAssetCommand(
  context: CommandContext,
  assetId: string,
  options: z.infer<typeof getOptionsSchema>,
): Promise<void> {
  requireApiKey(context);
  const asset = await fetchAsset(context, options.org, options.library, assetId);
  if (context.json) {
    printJson(context, asset);
    return;
  }
  renderRecord(context, [
    { label: "id", value: asset.id },
    { label: "name", value: asset.name ?? "" },
    { label: "type", value: asset.contentType ?? "" },
    { label: "size", value: formatBytes(asset.size) },
    { label: "dimensions", value: asset.width && asset.height ? `${asset.width}×${asset.height}` : "" },
    { label: "tags", value: (asset.tags ?? []).filter((tag) => tag !== null).join(",") },
    { label: "description", value: asset.description ?? "" },
    { label: "url", value: asset.url ?? "" },
  ]);
}

async function fetchAsset(
  context: CommandContext,
  organizationId: string,
  libraryId: string,
  assetId: string,
): Promise<AssetRecord> {
  const client = context.clientFactory();
  return unwrapResult(() =>
    client.GET("/organizations/{organizationId}/libraries/{libraryId}/assets/{assetId}", {
      params: { path: { organizationId, libraryId, assetId }, header: VERSION_HEADER },
    }),
  );
}

const searchOptionsSchema = z.object({
  org: z.string().min(1),
  library: z.array(z.string().min(1)).default([]),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
});

export async function searchAssetsCommand(
  context: CommandContext,
  query: string,
  options: z.infer<typeof searchOptionsSchema>,
): Promise<void> {
  requireApiKey(context);
  const client = context.clientFactory();
  const result = await unwrapResult(() =>
    client.GET("/organizations/{organizationId}/search/assets", {
      params: {
        path: { organizationId: options.org },
        header: VERSION_HEADER,
        query: {
          q: query,
          libraries: options.library.length > 0 ? options.library.join(",") : undefined,
          page: options.page,
          pageSize: options.pageSize,
        },
      },
    }),
  );
  if (context.json) {
    printJson(context, result);
    return;
  }
  note(context, `${result.found} result(s), page ${result.page}.`);
  renderTable(context, result.hits, SEARCH_HIT_COLUMNS);
}

const downloadOptionsSchema = inLibraryOptionsSchema.extend({
  output: z.string().min(1).optional(),
  force: z.boolean().default(false),
});

export async function downloadAssetCommand(
  context: CommandContext,
  assetId: string,
  options: z.infer<typeof downloadOptionsSchema>,
): Promise<void> {
  requireApiKey(context);
  const asset = await fetchAsset(context, options.org, options.library, assetId);
  const fileUrl = asset.url;
  if (!fileUrl) throw new CliError("Asset has no file URL to download.", EXIT_CODES.generic);
  const targetPath = options.output ?? asset.name ?? assetId;
  const response = await context.fetch(fileUrl);
  if (!response.ok) throw new NetworkError(`Download failed with HTTP ${response.status}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  try {
    await writeFile(targetPath, bytes, { flag: options.force ? "w" : "wx" });
  } catch (error) {
    if (isErrnoException(error) && error.code === "EEXIST") {
      throw new ValidationError(`${targetPath} already exists. Pass --force to overwrite.`);
    }
    throw error;
  }
  note(context, `Downloaded ${targetPath} (${formatBytes(bytes.byteLength)}).`);
  if (context.json) printJson(context, { assetId, path: targetPath, bytes: bytes.byteLength });
}

const uploadedAssetsSchema = z.object({
  assets: z.array(z.looseObject({ id: z.string().optional(), name: z.string().nullish() })),
});

const uploadOptionsSchema = inLibraryOptionsSchema;

export async function uploadAssetsCommand(
  context: CommandContext,
  files: string[],
  options: z.infer<typeof uploadOptionsSchema>,
): Promise<void> {
  if (files.length === 0) throw new UsageError("Provide at least one file to upload.");
  const { key } = requireApiKey(context);
  const batches = chunk(files, MAX_UPLOAD_FILES);
  const uploadedNames: string[] = [];
  const payloads: unknown[] = [];
  for (const [batchIndex, batch] of batches.entries()) {
    const formData = new FormData();
    for (const filePath of batch) {
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await readFile(filePath));
      } catch {
        throw new UsageError(`Cannot read file: ${filePath}`);
      }
      formData.append(
        "files",
        new Blob([bytes], { type: contentTypeForFilename(filePath) }),
        basename(filePath),
      );
    }
    if (batches.length > 1) {
      note(context, `Uploading batch ${batchIndex + 1}/${batches.length} (${batch.length} files)…`);
    }
    const response = await context.fetch(
      `${context.baseUrl}/organizations/${options.org}/libraries/${options.library}/assets`,
      { method: "POST", headers: buildRequestHeaders(key), body: formData },
    );
    const payload = await parseEnvelope(response);
    payloads.push(payload);
    const parsed = uploadedAssetsSchema.safeParse(payload);
    if (parsed.success) {
      uploadedNames.push(...parsed.data.assets.map((asset) => asset.name ?? asset.id ?? "(unnamed)"));
    }
  }
  if (context.json) {
    printJson(context, payloads.length === 1 ? payloads[0] : payloads);
    return;
  }
  note(context, `Uploaded ${uploadedNames.length} asset(s).`);
  for (const name of uploadedNames) {
    context.stdout(`${name}\n`);
  }
}

const removeOptionsSchema = inLibraryOptionsSchema.extend({
  yes: z.boolean().default(false),
});

export async function removeAssetsCommand(
  context: CommandContext,
  assetIds: string[],
  options: z.infer<typeof removeOptionsSchema>,
): Promise<void> {
  if (assetIds.length === 0) throw new UsageError("Provide at least one asset id.");
  if (assetIds.length > MAX_DELETE_IDS) {
    throw new ValidationError(`At most ${MAX_DELETE_IDS} asset ids are supported per call.`);
  }
  requireApiKey(context);
  if (!options.yes && context.isInteractive) {
    const confirmed = await context.confirm(`Move ${assetIds.length} asset(s) to trash?`);
    if (!confirmed) {
      note(context, "Aborted.");
      return;
    }
  }
  const client = context.clientFactory();
  const result = await unwrapResult(() =>
    client.DELETE("/organizations/{organizationId}/libraries/{libraryId}/assets", {
      params: {
        path: { organizationId: options.org, libraryId: options.library },
        header: VERSION_HEADER,
      },
      body: { ids: assetIds },
    }),
  );
  if (context.json) {
    printJson(context, result);
    return;
  }
  note(context, `Moved ${assetIds.length} asset(s) to trash. They are recoverable from the library trash.`);
}

const describeOptionsSchema = inLibraryOptionsSchema.extend({
  text: z.string().min(1),
});

export async function describeAssetCommand(
  context: CommandContext,
  assetId: string,
  options: z.infer<typeof describeOptionsSchema>,
): Promise<void> {
  requireApiKey(context);
  const client = context.clientFactory();
  const asset = await unwrapResult(() =>
    client.PATCH("/organizations/{organizationId}/libraries/{libraryId}/assets/{assetId}/description", {
      params: {
        path: { organizationId: options.org, libraryId: options.library, assetId },
        header: VERSION_HEADER,
      },
      body: { description: options.text },
    }),
  );
  if (context.json) {
    printJson(context, asset);
    return;
  }
  note(context, "Description updated.");
}

const transferOptionsSchema = inLibraryOptionsSchema.extend({
  to: z.string().min(1),
  asset: z.array(z.string().min(1)).min(1),
});

export async function transferAssetsCommand(
  context: CommandContext,
  options: z.infer<typeof transferOptionsSchema>,
): Promise<void> {
  requireApiKey(context);
  const client = context.clientFactory();
  const result = await unwrapResult(() =>
    client.POST("/organizations/{organizationId}/libraries/{libraryId}/assets/transfer", {
      params: {
        path: { organizationId: options.org, libraryId: options.library },
        header: VERSION_HEADER,
      },
      body: { targetLibraryId: options.to, assetIds: options.asset },
    }),
  );
  if (context.json) {
    printJson(context, result);
    return;
  }
  note(context, `Transferred ${options.asset.length} asset(s) to library ${options.to}.`);
}

export function registerAssetCommands(program: Command, runAction: ActionRunner): void {
  const assets = program.command("assets").description("Work with assets in a library");
  assets
    .command("ls")
    .description("List assets in a library")
    .requiredOption("--org <organizationId>", "Organization id")
    .requiredOption("--library <libraryId>", "Library id")
    .option("--page <number>", "Page number (1-based)")
    .option("--page-size <number>", "Results per page")
    .option("--tag <tag...>", "Filter by tag (repeatable, up to 5)")
    .action((options, command: Command) =>
      runAction(command, (context) => listAssetsCommand(context, parseOptions(listOptionsSchema, options))),
    );
  assets
    .command("get")
    .description("Show a single asset")
    .argument("<assetId>", "Asset id")
    .requiredOption("--org <organizationId>", "Organization id")
    .requiredOption("--library <libraryId>", "Library id")
    .action((assetId: string, options, command: Command) =>
      runAction(command, (context) => getAssetCommand(context, assetId, parseOptions(getOptionsSchema, options))),
    );
  assets
    .command("search")
    .description("Search assets across the organization")
    .argument("<query>", "Search query")
    .requiredOption("--org <organizationId>", "Organization id")
    .option("--library <libraryId...>", "Restrict to specific libraries (repeatable)")
    .option("--page <number>", "Page number (1-based)")
    .option("--page-size <number>", "Results per page")
    .action((query: string, options, command: Command) =>
      runAction(command, (context) =>
        searchAssetsCommand(context, query, parseOptions(searchOptionsSchema, options)),
      ),
    );
  assets
    .command("download")
    .description("Download an asset's file")
    .argument("<assetId>", "Asset id")
    .requiredOption("--org <organizationId>", "Organization id")
    .requiredOption("--library <libraryId>", "Library id")
    .option("-o, --output <path>", "Target file path")
    .option("--force", "Overwrite the target file if it exists")
    .action((assetId: string, options, command: Command) =>
      runAction(command, (context) =>
        downloadAssetCommand(context, assetId, parseOptions(downloadOptionsSchema, options)),
      ),
    );
  assets
    .command("upload")
    .description("Upload local files as assets")
    .argument("<files...>", "Local file paths")
    .requiredOption("--org <organizationId>", "Organization id")
    .requiredOption("--library <libraryId>", "Library id")
    .action((files: string[], options, command: Command) =>
      runAction(command, (context) =>
        uploadAssetsCommand(context, files, parseOptions(uploadOptionsSchema, options)),
      ),
    );
  assets
    .command("rm")
    .description("Move assets to trash (recoverable)")
    .argument("<assetIds...>", "Asset ids")
    .requiredOption("--org <organizationId>", "Organization id")
    .requiredOption("--library <libraryId>", "Library id")
    .option("--yes", "Skip the confirmation prompt")
    .action((assetIds: string[], options, command: Command) =>
      runAction(command, (context) =>
        removeAssetsCommand(context, assetIds, parseOptions(removeOptionsSchema, options)),
      ),
    );
  assets
    .command("describe")
    .description("Set an asset's description")
    .argument("<assetId>", "Asset id")
    .requiredOption("--org <organizationId>", "Organization id")
    .requiredOption("--library <libraryId>", "Library id")
    .requiredOption("--text <description>", "Description text")
    .action((assetId: string, options, command: Command) =>
      runAction(command, (context) =>
        describeAssetCommand(context, assetId, parseOptions(describeOptionsSchema, options)),
      ),
    );
  assets
    .command("transfer")
    .description("Move assets to another library")
    .requiredOption("--org <organizationId>", "Organization id")
    .requiredOption("--library <libraryId>", "Source library id")
    .requiredOption("--to <libraryId>", "Target library id")
    .requiredOption("--asset <assetId...>", "Asset ids (repeatable)")
    .action((options, command: Command) =>
      runAction(command, (context) =>
        transferAssetsCommand(context, parseOptions(transferOptionsSchema, options)),
      ),
    );
}
