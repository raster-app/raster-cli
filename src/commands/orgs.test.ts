import { describe, expect, test } from "bun:test";
import { stat } from "node:fs/promises";
import { CONFIG_FILE_MODE, configPath, readConfig } from "../config";
import { executeCommand } from "../lib/context";
import { EXIT_CODES } from "../lib/errors";
import {
  createMockFetch,
  createTestContext,
  dataEnvelope,
  errorEnvelopeBody,
  jsonRoute,
} from "../test-support";
import { createOrganizationCommand } from "./orgs";

const MINTED_KEY = `pk_${"m".repeat(45)}`;
const TEST_EMAIL = ["claim-test", "example.com"].join("@");
const CREATED = {
  organizationId: "org_eph",
  libraryId: "lib_eph",
  apiKey: MINTED_KEY,
  claimUrl: "https://raster.app/claim/abc",
  expiresAt: "2026-07-10T00:00:00.000Z",
  emailSent: true,
};

describe("orgs create", () => {
  test("Req 7.1: sends no Authorization header and renders the response fields", async () => {
    const { fetchImpl, requests } = createMockFetch(jsonRoute("POST", "/libraries", 200, dataEnvelope(CREATED)));
    const { context, stdoutLines } = await createTestContext({ fetch: fetchImpl });
    await createOrganizationCommand(context, { email: TEST_EMAIL, save: false });
    const request = requests[0];
    expect(request?.headers.get("authorization")).toBeNull();
    expect(request?.headers.get("api-version")).toBe("2026-05-20");
    const output = stdoutLines.join("");
    expect(output).toContain("org_eph");
    expect(output).toContain("https://raster.app/claim/abc");
  });

  test("Req 7.2: --save stores the minted key with 0600 permissions", async () => {
    const { fetchImpl } = createMockFetch(jsonRoute("POST", "/libraries", 200, dataEnvelope(CREATED)));
    const { context, env } = await createTestContext({ fetch: fetchImpl });
    await createOrganizationCommand(context, { email: TEST_EMAIL, save: true });
    expect((await readConfig(env)).apiKey).toBe(MINTED_KEY);
    const stats = await stat(configPath(env));
    expect(stats.mode & 0o777).toBe(CONFIG_FILE_MODE);
  });

  test("Req 2.7: human output never contains the full minted key", async () => {
    const { fetchImpl } = createMockFetch(jsonRoute("POST", "/libraries", 200, dataEnvelope(CREATED)));
    const { context, stdoutLines, stderrLines } = await createTestContext({ fetch: fetchImpl });
    await createOrganizationCommand(context, { email: TEST_EMAIL, save: true });
    const combined = stdoutLines.join("") + stderrLines.join("");
    expect(combined).not.toContain(MINTED_KEY);
    expect(combined).toContain("pk_mmm…");
  });

  test("Req 7.2: --json prints the payload including the minted key", async () => {
    const { fetchImpl } = createMockFetch(jsonRoute("POST", "/libraries", 200, dataEnvelope(CREATED)));
    const { context, stdoutLines } = await createTestContext({ fetch: fetchImpl, json: true });
    await createOrganizationCommand(context, { email: TEST_EMAIL, save: false });
    const parsed: unknown = JSON.parse(stdoutLines.join(""));
    expect(parsed).toEqual(CREATED);
  });

  test("Req 7.3: the per-email limit error surfaces verbatim", async () => {
    const { fetchImpl } = createMockFetch(
      jsonRoute("POST", "/libraries", 400, errorEnvelopeBody("BAD_USER_INPUT", "Too many unclaimed libraries for this email.")),
    );
    const { context, stderrLines } = await createTestContext({ fetch: fetchImpl });
    const exitCode = await executeCommand(context, () =>
      createOrganizationCommand(context, { email: TEST_EMAIL, save: false }),
    );
    expect(exitCode).toBe(EXIT_CODES.validation);
    expect(stderrLines.join("")).toContain("Too many unclaimed libraries for this email.");
  });
});
