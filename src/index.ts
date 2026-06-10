import { Command, CommanderError } from "commander";
import { z } from "zod";
import packageJson from "../package.json" with { type: "json" };
import { API_VERSION } from "./api/version";
import { registerAssetCommands } from "./commands/assets";
import { registerAuthCommands } from "./commands/auth";
import { registerLibraryCommands } from "./commands/libraries";
import { registerOrgCommands } from "./commands/orgs";
import { registerTagCommands } from "./commands/tags";
import { createCommandContext, executeCommand, type CommandContext } from "./lib/context";
import { CliError, EXIT_CODES } from "./lib/errors";

const globalOptionsSchema = z.object({
  apiKey: z.string().optional(),
  org: z.string().optional(),
  library: z.string().optional(),
  json: z.boolean().optional(),
  verbose: z.boolean().optional(),
});

async function runAction(command: Command, handler: (context: CommandContext) => Promise<void>): Promise<void> {
  let context: CommandContext;
  try {
    const globals = globalOptionsSchema.parse(command.optsWithGlobals());
    context = await createCommandContext(globals);
  } catch (error) {
    if (error instanceof CliError) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = error.exitCode;
      return;
    }
    throw error;
  }
  process.exitCode = await executeCommand(context, () => handler(context));
}

function exitCodeForCommanderError(error: unknown): number {
  if (error instanceof CommanderError) {
    const benignCodes = new Set(["commander.helpDisplayed", "commander.help", "commander.version"]);
    return benignCodes.has(error.code) ? EXIT_CODES.success : EXIT_CODES.usage;
  }
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  return EXIT_CODES.generic;
}

const program = new Command();
program
  .name("raster")
  .description("Command-line client for the Raster API")
  .version(`${packageJson.version} (Api-Version ${API_VERSION})`, "-V, --version", "Print the CLI version and the pinned Api-Version")
  .option("--api-key <key>", "API key (overrides RASTER_API_KEY and the config file)")
  .option("--org <organizationId>", "Organization id (derived from the API key when omitted)")
  .option("--library <libraryId>", "Library id (derived from the API key when it has one library)")
  .option("--json", "Print machine-readable JSON to stdout")
  .option("--verbose", "Log requests to stderr (keys masked)")
  .exitOverride();

registerAuthCommands(program, runAction);
registerLibraryCommands(program, runAction);
registerAssetCommands(program, runAction);
registerTagCommands(program, runAction);
registerOrgCommands(program, runAction);

const userArguments = process.argv.slice(2);
if (userArguments.length === 0) {
  program.outputHelp();
  process.exitCode = EXIT_CODES.success;
} else {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    process.exitCode = exitCodeForCommanderError(error);
  }
}
