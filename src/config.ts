import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { CliError, EXIT_CODES } from "./lib/errors";
import { isErrnoException } from "./lib/helpers";

export const CONFIG_FILE_NAME = "config.json";
export const CONFIG_FILE_MODE = 0o600;
const CONFIG_DIR_MODE = 0o700;

const configSchema = z.object({
  apiKey: z.string().min(1).optional(),
  // Scope cached at login so commands resolve org/library without an extra /me.
  organizationId: z.string().min(1).optional(),
  libraries: z.array(z.string()).optional(),
});

export type CliConfig = z.infer<typeof configSchema>;

export function configDir(env: NodeJS.ProcessEnv): string {
  if (env.RASTER_CONFIG_HOME) return env.RASTER_CONFIG_HOME;
  if (env.XDG_CONFIG_HOME) return join(env.XDG_CONFIG_HOME, "raster");
  return join(homedir(), ".config", "raster");
}

export function configPath(env: NodeJS.ProcessEnv): string {
  return join(configDir(env), CONFIG_FILE_NAME);
}

export async function readConfig(env: NodeJS.ProcessEnv): Promise<CliConfig> {
  const path = configPath(env);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") return {};
    throw new CliError(`Cannot read config file at ${path}.`, EXIT_CODES.generic);
  }
  try {
    return configSchema.parse(JSON.parse(raw));
  } catch {
    throw new CliError(
      `Config file at ${path} is invalid. Fix or delete it, then run \`raster auth login\` again.`,
      EXIT_CODES.generic,
    );
  }
}

export async function writeConfig(config: CliConfig, env: NodeJS.ProcessEnv): Promise<void> {
  const dir = configDir(env);
  await mkdir(dir, { recursive: true, mode: CONFIG_DIR_MODE });
  const path = join(dir, CONFIG_FILE_NAME);
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { mode: CONFIG_FILE_MODE });
  // The mode option applies only when the file is created; enforce it on rewrites too.
  await chmod(path, CONFIG_FILE_MODE);
}

export type ApiKeySource = "flag" | "env" | "config";

export type ResolvedApiKey = {
  key: string;
  source: ApiKeySource;
};

export function resolveApiKey(options: {
  flagKey?: string | undefined;
  env: NodeJS.ProcessEnv;
  config: CliConfig;
}): ResolvedApiKey | null {
  if (options.flagKey) return { key: options.flagKey, source: "flag" };
  if (options.env.RASTER_API_KEY) return { key: options.env.RASTER_API_KEY, source: "env" };
  if (options.config.apiKey) return { key: options.config.apiKey, source: "config" };
  return null;
}
