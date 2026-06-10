import { describe, expect, test } from "bun:test";
import { stat } from "node:fs/promises";
import { configPath, readConfig, writeConfig, CONFIG_FILE_MODE } from "../config";
import { executeCommand } from "../lib/context";
import { EXIT_CODES } from "../lib/errors";
import {
  createMockFetch,
  createTestContext,
  createTestEnv,
  dataEnvelope,
  errorEnvelopeBody,
  jsonRoute,
  TEST_API_KEY,
} from "../test-support";
import { loginCommand, logoutCommand, statusCommand, whoamiCommand } from "./auth";

const VIEWER = {
  organizationId: "org_1",
  organizationName: "Acme",
  plan: "pro",
  libraries: ["lib_1", "lib_2"],
};

describe("auth login", () => {
  test("Req 2.2: validates via GET /me and stores the key with 0600 permissions", async () => {
    const { fetchImpl, requests } = createMockFetch(jsonRoute("GET", "/me", 200, dataEnvelope(VIEWER)));
    const { context, env } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY });
    await loginCommand(context);
    expect(requests.length).toBe(1);
    const config = await readConfig(env);
    expect(config.apiKey).toBe(TEST_API_KEY);
    // Scope is cached so later commands skip /me.
    expect(config.organizationId).toBe("org_1");
    expect(config.libraries).toEqual(["lib_1", "lib_2"]);
    const stats = await stat(configPath(env));
    expect(stats.mode & 0o777).toBe(CONFIG_FILE_MODE);
  });

  test("Req 2.2: prompts for the key when interactive and no flag is given", async () => {
    const { fetchImpl } = createMockFetch(jsonRoute("GET", "/me", 200, dataEnvelope(VIEWER)));
    const { context, env } = await createTestContext({
      fetch: fetchImpl,
      isInteractive: true,
      promptSecret: async () => TEST_API_KEY,
    });
    await loginCommand(context);
    expect((await readConfig(env)).apiKey).toBe(TEST_API_KEY);
  });

  test("Req 2.2: an ambient env key is not auto-stored — login prompts and stores the entered key", async () => {
    const env = await createTestEnv({ RASTER_API_KEY: "pk_ambient_env_key" });
    const { fetchImpl } = createMockFetch(jsonRoute("GET", "/me", 200, dataEnvelope(VIEWER)));
    const enteredKey = `pk_${"p".repeat(45)}`;
    const { context } = await createTestContext({
      env,
      fetch: fetchImpl,
      isInteractive: true,
      promptSecret: async () => enteredKey,
    });
    await loginCommand(context);
    expect((await readConfig(env)).apiKey).toBe(enteredKey);
  });

  test("Req 2.3: a rejected key writes nothing, surfaces the API message, exits 3", async () => {
    const { fetchImpl } = createMockFetch(
      jsonRoute("GET", "/me", 401, errorEnvelopeBody("UNAUTHENTICATED", "Invalid API key.")),
    );
    const { context, env, stderrLines } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY });
    const exitCode = await executeCommand(context, () => loginCommand(context));
    expect(exitCode).toBe(EXIT_CODES.auth);
    expect(stderrLines.join("")).toContain("Invalid API key.");
    expect((await readConfig(env)).apiKey).toBeUndefined();
  });

  test("Req 2.2: non-interactive login without --api-key is a usage error", async () => {
    const { fetchImpl, requests } = createMockFetch();
    const { context } = await createTestContext({ fetch: fetchImpl, isInteractive: false });
    const exitCode = await executeCommand(context, () => loginCommand(context));
    expect(exitCode).toBe(EXIT_CODES.usage);
    expect(requests.length).toBe(0);
  });
});

describe("auth logout", () => {
  test("Req 2.5: removes the stored key and succeeds even when none was stored", async () => {
    const env = await createTestEnv();
    await writeConfig({ apiKey: TEST_API_KEY }, env);
    const first = await createTestContext({ env });
    await logoutCommand(first.context);
    expect((await readConfig(env)).apiKey).toBeUndefined();
    const second = await createTestContext({ env });
    await logoutCommand(second.context);
    expect(second.stderrLines.join("")).toContain("Logged out.");
  });
});

describe("auth status", () => {
  test("Req 2.4: reports when no key is resolvable", async () => {
    const { context, stderrLines } = await createTestContext({});
    await statusCommand(context);
    expect(stderrLines.join("")).toContain("Not authenticated");
  });

  test("Req 2.4: reports the source and masked prefix for a flag key", async () => {
    const { fetchImpl } = createMockFetch(jsonRoute("GET", "/me", 200, dataEnvelope(VIEWER)));
    const { context, stderrLines } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY });
    await statusCommand(context);
    const output = stderrLines.join("");
    expect(output).toContain("(from flag)");
    expect(output).toContain("pk_aaa…");
    expect(output).toContain("Acme");
  });

  test("Req 2.4: reports the env source", async () => {
    const env = await createTestEnv({ RASTER_API_KEY: TEST_API_KEY });
    const { fetchImpl } = createMockFetch(jsonRoute("GET", "/me", 200, dataEnvelope(VIEWER)));
    const { context, stderrLines } = await createTestContext({ env, fetch: fetchImpl });
    await statusCommand(context);
    expect(stderrLines.join("")).toContain("(from env)");
  });

  test("Req 2.4: reports the config source", async () => {
    const env = await createTestEnv();
    await writeConfig({ apiKey: TEST_API_KEY }, env);
    const { fetchImpl } = createMockFetch(jsonRoute("GET", "/me", 200, dataEnvelope(VIEWER)));
    const { context, stderrLines } = await createTestContext({ env, fetch: fetchImpl });
    await statusCommand(context);
    expect(stderrLines.join("")).toContain("(from config)");
  });
});

describe("whoami", () => {
  test("Req 2.6: without a key it instructs login and makes no request", async () => {
    const { fetchImpl, requests } = createMockFetch();
    const { context, stderrLines } = await createTestContext({ fetch: fetchImpl });
    const exitCode = await executeCommand(context, () => whoamiCommand(context));
    expect(exitCode).toBe(EXIT_CODES.auth);
    expect(requests.length).toBe(0);
    expect(stderrLines.join("")).toContain("raster auth login");
  });

  test("Req 8.3: with --json an API error prints the error envelope to stdout", async () => {
    const { fetchImpl } = createMockFetch(
      jsonRoute("GET", "/me", 401, errorEnvelopeBody("UNAUTHENTICATED", "Invalid API key.")),
    );
    const { context, stdoutLines } = await createTestContext({
      fetch: fetchImpl,
      flagApiKey: TEST_API_KEY,
      json: true,
    });
    const exitCode = await executeCommand(context, () => whoamiCommand(context));
    expect(exitCode).toBe(EXIT_CODES.auth);
    const parsed: unknown = JSON.parse(stdoutLines.join(""));
    expect(parsed).toEqual({ error: { code: "UNAUTHENTICATED", message: "Invalid API key." } });
  });
});
