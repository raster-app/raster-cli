import { describe, expect, test } from "bun:test";
import { writeConfig } from "../config";
import {
  createMockFetch,
  createTestContext,
  createTestEnv,
  dataEnvelope,
  jsonRoute,
  TEST_API_KEY,
} from "../test-support";
import { UsageError } from "./errors";

const viewer = (libraries: string[]) => ({
  organizationId: "org_derived",
  organizationName: "Acme",
  plan: "pro",
  libraries,
});

describe("context.resolveOrg", () => {
  test("returns --org without calling /me", async () => {
    const { fetchImpl, requests } = createMockFetch();
    const { context } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY, org: "org_flag" });
    expect(await context.resolveOrg()).toBe("org_flag");
    expect(requests.length).toBe(0);
  });

  test("derives the org from the API key via /me when --org is omitted", async () => {
    const { fetchImpl, requests } = createMockFetch(jsonRoute("GET", "/me", 200, dataEnvelope(viewer(["lib_1"]))));
    const { context } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY });
    expect(await context.resolveOrg()).toBe("org_derived");
    expect(requests.length).toBe(1);
  });
});

describe("context.resolveLibrary", () => {
  test("returns --library without calling /me", async () => {
    const { fetchImpl, requests } = createMockFetch();
    const { context } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY, library: "lib_flag" });
    expect(await context.resolveLibrary()).toBe("lib_flag");
    expect(requests.length).toBe(0);
  });

  test("derives the single library the key can access", async () => {
    const { fetchImpl } = createMockFetch(jsonRoute("GET", "/me", 200, dataEnvelope(viewer(["only_lib"]))));
    const { context } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY });
    expect(await context.resolveLibrary()).toBe("only_lib");
  });

  test("requires --library when the key spans multiple libraries", async () => {
    const { fetchImpl } = createMockFetch(jsonRoute("GET", "/me", 200, dataEnvelope(viewer(["a", "b"]))));
    const { context } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY });
    expect(context.resolveLibrary()).rejects.toThrow(UsageError);
  });
});

describe("shared /me lookup", () => {
  test("resolveOrg and resolveLibrary share a single /me call", async () => {
    const { fetchImpl, requests } = createMockFetch(jsonRoute("GET", "/me", 200, dataEnvelope(viewer(["lib_1"]))));
    const { context } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY });
    await context.resolveOrg();
    await context.resolveLibrary();
    const meCalls = requests.filter((request) => new URL(request.url).pathname === "/me").length;
    expect(meCalls).toBe(1);
  });
});

describe("cached scope from login", () => {
  test("org and single library come from config with no /me call", async () => {
    const env = await createTestEnv();
    await writeConfig({ apiKey: TEST_API_KEY, organizationId: "org_cached", libraries: ["lib_cached"] }, env);
    const { fetchImpl, requests } = createMockFetch();
    const { context } = await createTestContext({ env, fetch: fetchImpl });
    expect(await context.resolveOrg()).toBe("org_cached");
    expect(await context.resolveLibrary()).toBe("lib_cached");
    expect(requests.length).toBe(0);
  });

  test("cached multi-library scope still requires --library, without /me", async () => {
    const env = await createTestEnv();
    await writeConfig({ apiKey: TEST_API_KEY, organizationId: "org_cached", libraries: ["a", "b"] }, env);
    const { fetchImpl, requests } = createMockFetch();
    const { context } = await createTestContext({ env, fetch: fetchImpl });
    expect(context.resolveLibrary()).rejects.toThrow(UsageError);
    expect(requests.length).toBe(0);
  });

  test("ignores cached scope when a different key is active", async () => {
    const env = await createTestEnv();
    await writeConfig({ apiKey: "pk_logged_in", organizationId: "org_cached", libraries: ["lib_cached"] }, env);
    const { fetchImpl, requests } = createMockFetch(jsonRoute("GET", "/me", 200, dataEnvelope(viewer(["lib_other"]))));
    const { context } = await createTestContext({ env, fetch: fetchImpl, flagApiKey: "pk_different" });
    expect(await context.resolveOrg()).toBe("org_derived");
    expect(requests.length).toBe(1);
  });
});
