import { describe, expect, test } from "bun:test";
import { stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CONFIG_FILE_MODE,
  configDir,
  configPath,
  readConfig,
  writeConfig,
} from "./config";
import { CliError } from "./lib/errors";
import { createTestEnv } from "./test-support";

describe("configDir", () => {
  test("Req 2.2: RASTER_CONFIG_HOME wins over XDG_CONFIG_HOME", () => {
    const env: NodeJS.ProcessEnv = { RASTER_CONFIG_HOME: "/custom", XDG_CONFIG_HOME: "/xdg" };
    expect(configDir(env)).toBe("/custom");
  });

  test("Req 2.2: XDG_CONFIG_HOME gets a raster subdirectory", () => {
    const env: NodeJS.ProcessEnv = { XDG_CONFIG_HOME: "/xdg" };
    expect(configDir(env)).toBe(join("/xdg", "raster"));
  });

  test("Req 2.2: defaults to ~/.config/raster", () => {
    expect(configDir({})).toContain(join(".config", "raster"));
  });
});

describe("readConfig / writeConfig", () => {
  test("Req 2.2: writeConfig creates the file with 0600 permissions", async () => {
    const env = await createTestEnv();
    await writeConfig({ apiKey: "pk_test" }, env);
    const stats = await stat(configPath(env));
    expect(stats.mode & 0o777).toBe(CONFIG_FILE_MODE);
    const config = await readConfig(env);
    expect(config.apiKey).toBe("pk_test");
  });

  test("Req 2.2: rewriting keeps 0600 permissions", async () => {
    const env = await createTestEnv();
    await writeConfig({ apiKey: "pk_one" }, env);
    await writeConfig({ apiKey: "pk_two" }, env);
    const stats = await stat(configPath(env));
    expect(stats.mode & 0o777).toBe(CONFIG_FILE_MODE);
  });

  test("a missing config file reads as empty", async () => {
    const env = await createTestEnv();
    expect(await readConfig(env)).toEqual({});
  });

  test("an invalid config file surfaces a CliError naming the path", async () => {
    const env = await createTestEnv();
    await writeConfig({}, env);
    await writeFile(configPath(env), "not json");
    expect(readConfig(env)).rejects.toThrow(CliError);
  });
});
