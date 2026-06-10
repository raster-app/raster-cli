import { describe, expect, test } from "bun:test";
import { resolveApiKey } from "./config";
import { executeCommand } from "./lib/context";
import { ApiError, EXIT_CODES } from "./lib/errors";
import { whoamiCommand } from "./commands/auth";
import { createOrganizationCommand } from "./commands/orgs";
import { uploadAssetsCommand } from "./commands/assets";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createMockFetch,
  createTestContext,
  dataEnvelope,
  errorEnvelopeBody,
  jsonRoute,
  TEST_API_KEY,
} from "./test-support";

const VIEWER = { organizationId: "org_1", organizationName: "Acme", plan: "pro", libraries: ["lib_1"] };

describe("Property 1: credential precedence is total and deterministic", () => {
  // Req 2.1, 2.6 — all 8 presence combinations resolve to the highest-precedence source.
  const flagKey = "pk_flag";
  const envKey = "pk_env";
  const configKey = "pk_config";
  const combinations: Array<[boolean, boolean, boolean, "flag" | "env" | "config" | null]> = [
    [true, true, true, "flag"],
    [true, true, false, "flag"],
    [true, false, true, "flag"],
    [true, false, false, "flag"],
    [false, true, true, "env"],
    [false, true, false, "env"],
    [false, false, true, "config"],
    [false, false, false, null],
  ];
  for (const [hasFlag, hasEnv, hasConfig, expectedSource] of combinations) {
    test(`flag=${hasFlag} env=${hasEnv} config=${hasConfig} → ${expectedSource ?? "none"}`, () => {
      const resolved = resolveApiKey({
        flagKey: hasFlag ? flagKey : undefined,
        env: hasEnv ? { RASTER_API_KEY: envKey } : {},
        config: hasConfig ? { apiKey: configKey } : {},
      });
      if (expectedSource === null) {
        expect(resolved).toBeNull();
        return;
      }
      expect(resolved?.source).toBe(expectedSource);
    });
  }
});

describe("Property 2: the key never leaves in cleartext", () => {
  test("Req 2.7, 8.4, 10.1: verbose failure output carries only the masked prefix", async () => {
    const { fetchImpl } = createMockFetch(
      jsonRoute("GET", "/me", 401, errorEnvelopeBody("UNAUTHENTICATED", "Invalid API key.")),
    );
    const { context, stdoutLines, stderrLines } = await createTestContext({
      fetch: fetchImpl,
      flagApiKey: TEST_API_KEY,
      verbose: true,
    });
    await executeCommand(context, () => whoamiCommand(context));
    const combined = stdoutLines.join("") + stderrLines.join("");
    expect(combined).not.toContain(TEST_API_KEY);
    expect(combined).toContain("pk_aaa…");
  });
});

describe("Property 3: every request carries the version pin", () => {
  test("Req 3.1, 3.2: authenticated calls carry Api-Version and Bearer", async () => {
    const { fetchImpl, requests } = createMockFetch(jsonRoute("GET", "/me", 200, dataEnvelope(VIEWER)));
    const { context } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY });
    await whoamiCommand(context);
    const request = requests[0];
    expect(request?.headers.get("api-version")).toBe("2026-05-20");
    expect(request?.headers.get("authorization")).toBe(`Bearer ${TEST_API_KEY}`);
  });

  test("Req 7.1: orgs create carries the version and no Authorization", async () => {
    const { fetchImpl, requests } = createMockFetch(
      jsonRoute("POST", "/libraries", 200, dataEnvelope({ organizationId: "org_eph" })),
    );
    const { context } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY });
    await createOrganizationCommand(context, { email: ["p3", "example.com"].join("@"), save: false });
    const request = requests[0];
    expect(request?.headers.get("api-version")).toBe("2026-05-20");
    expect(request?.headers.get("authorization")).toBeNull();
  });
});

describe("Property 4: exit code is a pure function of outcome", () => {
  // Req 8.5 — executeCommand maps thrown ApiErrors straight to the documented codes.
  const cases: Array<[number, number]> = [
    [401, EXIT_CODES.auth],
    [403, EXIT_CODES.auth],
    [404, EXIT_CODES.notFound],
    [409, EXIT_CODES.validation],
    [413, EXIT_CODES.payloadTooLarge],
    [500, EXIT_CODES.generic],
  ];
  for (const [status, expected] of cases) {
    test(`HTTP ${status} → exit ${expected}`, async () => {
      const { context } = await createTestContext({});
      const exitCode = await executeCommand(context, async () => {
        throw new ApiError("CODE", "message", status);
      });
      expect(exitCode).toBe(expected);
    });
  }

  test("success → exit 0", async () => {
    const { context } = await createTestContext({});
    expect(await executeCommand(context, async () => {})).toBe(EXIT_CODES.success);
  });
});

describe("Property 5: --json stdout is exactly the payload", () => {
  test("Req 8.1, 8.2: whoami --json stdout parses to the viewer payload, nothing else", async () => {
    const { fetchImpl } = createMockFetch(jsonRoute("GET", "/me", 200, dataEnvelope(VIEWER)));
    const { context, stdoutLines } = await createTestContext({
      fetch: fetchImpl,
      flagApiKey: TEST_API_KEY,
      json: true,
    });
    await whoamiCommand(context);
    const parsed: unknown = JSON.parse(stdoutLines.join(""));
    expect(parsed).toEqual(VIEWER);
  });
});

describe("Property 6: uploads never exceed the per-request cap", () => {
  test("Req 6.1: 21 files issue 2 requests", async () => {
    const directory = await mkdtemp(join(tmpdir(), "raster-contracts-"));
    const files: string[] = [];
    for (let index = 0; index < 21; index += 1) {
      const path = join(directory, `f${index}.png`);
      await writeFile(path, "x");
      files.push(path);
    }
    const { fetchImpl, requests } = createMockFetch(
      jsonRoute("POST", "/organizations/org_1/libraries/lib_1/assets", 200, dataEnvelope({ assets: [] })),
    );
    const { context } = await createTestContext({
      fetch: fetchImpl,
      flagApiKey: TEST_API_KEY,
      org: "org_1",
      library: "lib_1",
    });
    await uploadAssetsCommand(context, files);
    expect(requests.length).toBe(2);
  });
});
