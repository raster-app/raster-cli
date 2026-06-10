import { describe, expect, test } from "bun:test";
import { executeCommand } from "../lib/context";
import { EXIT_CODES } from "../lib/errors";
import {
  createMockFetch,
  createTestContext,
  dataEnvelope,
  errorEnvelopeBody,
  jsonRoute,
  TEST_API_KEY,
} from "../test-support";
import { createLibraryCommand, listLibrariesCommand, renameLibraryCommand } from "./libraries";

const ORG = "org_1";
const LIBRARIES_PATH = `/organizations/${ORG}/libraries`;

describe("libraries ls", () => {
  test("Req 4.1: renders the returned libraries and forwards pagination", async () => {
    const libraries = [{ id: "lib_1", name: "Brand", assetsCount: 12, trashCount: 1, tags: [] }];
    const { fetchImpl, requests } = createMockFetch(jsonRoute("GET", LIBRARIES_PATH, 200, dataEnvelope(libraries)));
    const { context, stdoutLines } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY });
    await listLibrariesCommand(context, { org: ORG, page: 2, pageSize: 5 });
    const url = new URL(requests[0]?.url ?? "");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("pageSize")).toBe("5");
    const output = stdoutLines.join("");
    expect(output).toContain("lib_1");
    expect(output).toContain("Brand");
  });

  test("Req 4.1: a rejected key surfaces the API message and exits 3", async () => {
    const { fetchImpl } = createMockFetch(
      jsonRoute("GET", LIBRARIES_PATH, 401, errorEnvelopeBody("UNAUTHENTICATED", "Invalid API key.")),
    );
    const { context, stderrLines } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY });
    const exitCode = await executeCommand(context, () => listLibrariesCommand(context, { org: ORG }));
    expect(exitCode).toBe(EXIT_CODES.auth);
    expect(stderrLines.join("")).toContain("Invalid API key.");
  });
});

describe("libraries create", () => {
  test("Req 4.2: sends { name, slug } and renders the created library", async () => {
    const { fetchImpl, requests } = createMockFetch(
      jsonRoute("POST", LIBRARIES_PATH, 201, dataEnvelope({ id: "lib_new", name: "Marketing" })),
    );
    const { context, stdoutLines } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY });
    await createLibraryCommand(context, { org: ORG, name: "Marketing", slug: "marketing" });
    const body: unknown = JSON.parse((await requests[0]?.text()) ?? "");
    expect(body).toEqual({ name: "Marketing", slug: "marketing" });
    expect(stdoutLines.join("")).toContain("lib_new");
  });

  test("Req 4.2: a taken slug surfaces the API conflict and exits 5", async () => {
    const { fetchImpl } = createMockFetch(
      jsonRoute("POST", LIBRARIES_PATH, 409, errorEnvelopeBody("CONFLICT", "Library URL already exists.")),
    );
    const { context, stderrLines } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY });
    const exitCode = await executeCommand(context, () =>
      createLibraryCommand(context, { org: ORG, name: "Marketing", slug: "marketing" }),
    );
    expect(exitCode).toBe(EXIT_CODES.validation);
    expect(stderrLines.join("")).toContain("Library URL already exists.");
  });
});

describe("libraries rename", () => {
  test("Req 4.3: sends { name } to the library PATCH endpoint", async () => {
    const { fetchImpl, requests } = createMockFetch(
      jsonRoute("PATCH", `${LIBRARIES_PATH}/lib_1`, 200, dataEnvelope({ id: "lib_1", name: "Renamed" })),
    );
    const { context } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY });
    await renameLibraryCommand(context, { org: ORG, library: "lib_1", name: "Renamed" });
    const body: unknown = JSON.parse((await requests[0]?.text()) ?? "");
    expect(body).toEqual({ name: "Renamed" });
  });
});
