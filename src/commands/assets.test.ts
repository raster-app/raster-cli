import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeCommand } from "../lib/context";
import { EXIT_CODES } from "../lib/errors";
import {
  createMockFetch,
  createTestContext,
  dataEnvelope,
  errorEnvelopeBody,
  jsonRoute,
  rawRoute,
  TEST_API_KEY,
} from "../test-support";
import {
  downloadAssetCommand,
  getAssetCommand,
  listAssetsCommand,
  removeAssetsCommand,
  searchAssetsCommand,
  transferAssetsCommand,
  uploadAssetsCommand,
} from "./assets";

const ORG = "org_1";
const LIBRARY = "lib_1";
const ASSETS_PATH = `/organizations/${ORG}/libraries/${LIBRARY}/assets`;

type MockFetch = ReturnType<typeof createMockFetch>["fetchImpl"];

function inLibrary(fetchImpl: MockFetch, overrides: { library?: string } = {}) {
  return createTestContext({
    fetch: fetchImpl,
    flagApiKey: TEST_API_KEY,
    org: ORG,
    library: overrides.library ?? LIBRARY,
  });
}

describe("assets ls", () => {
  test("Req 5.1: forwards pagination and comma-joins tag filters", async () => {
    const { fetchImpl, requests } = createMockFetch(jsonRoute("GET", ASSETS_PATH, 200, dataEnvelope([])));
    const { context } = await inLibrary(fetchImpl);
    await listAssetsCommand(context, { page: 2, pageSize: 10, tag: ["red", "blue"] });
    const url = new URL(requests[0]?.url ?? "");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("pageSize")).toBe("10");
    expect(url.searchParams.get("tags")).toBe("red,blue");
  });

  test("Req 5.1: more than 5 tag filters fails locally with no request", async () => {
    const { fetchImpl, requests } = createMockFetch();
    const { context } = await inLibrary(fetchImpl);
    const exitCode = await executeCommand(context, () =>
      listAssetsCommand(context, { tag: ["a", "b", "c", "d", "e", "f"] }),
    );
    expect(exitCode).toBe(EXIT_CODES.validation);
    expect(requests.length).toBe(0);
  });
});

describe("assets get", () => {
  test("Req 5.2: a missing asset surfaces the API 404 and exits 4", async () => {
    const { fetchImpl } = createMockFetch(
      jsonRoute("GET", `${ASSETS_PATH}/a_missing`, 404, errorEnvelopeBody("RESOURCE_NOT_FOUND", "Asset not found.")),
    );
    const { context, stderrLines } = await inLibrary(fetchImpl);
    const exitCode = await executeCommand(context, () => getAssetCommand(context, "a_missing"));
    expect(exitCode).toBe(EXIT_CODES.notFound);
    expect(stderrLines.join("")).toContain("Asset not found.");
  });
});

describe("assets search", () => {
  test("Req 5.3: sends q org-wide and omits the library filter when no --library", async () => {
    const { fetchImpl, requests } = createMockFetch(
      jsonRoute("GET", `/organizations/${ORG}/search/assets`, 200, dataEnvelope({ hits: [], found: 0, page: 1 })),
    );
    const { context } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY, org: ORG });
    await searchAssetsCommand(context, "sunset", {});
    const url = new URL(requests[0]?.url ?? "");
    expect(url.searchParams.get("q")).toBe("sunset");
    expect(url.searchParams.get("libraries")).toBeNull();
  });

  test("Req 5.3: scopes to the library when --library is given", async () => {
    const { fetchImpl, requests } = createMockFetch(
      jsonRoute("GET", `/organizations/${ORG}/search/assets`, 200, dataEnvelope({ hits: [], found: 0, page: 1 })),
    );
    const { context } = await inLibrary(fetchImpl);
    await searchAssetsCommand(context, "sunset", {});
    expect(new URL(requests[0]?.url ?? "").searchParams.get("libraries")).toBe(LIBRARY);
  });
});

describe("assets download", () => {
  async function downloadFixture() {
    const directory = await mkdtemp(join(tmpdir(), "raster-download-"));
    const target = join(directory, "photo.png");
    const asset = { id: "a_1", name: "photo.png", url: "https://cdn.raster.test/a_1" };
    const { fetchImpl } = createMockFetch(
      jsonRoute("GET", `${ASSETS_PATH}/a_1`, 200, dataEnvelope(asset)),
      rawRoute("GET", "/a_1", () => new Response("image-bytes", { status: 200 })),
    );
    const { context } = await inLibrary(fetchImpl);
    return { context, target };
  }

  test("Req 5.4: downloads the asset's url field to the target path", async () => {
    const { context, target } = await downloadFixture();
    await downloadAssetCommand(context, "a_1", { output: target, force: false });
    expect(await readFile(target, "utf8")).toBe("image-bytes");
  });

  test("Req 5.4: refuses to overwrite without --force", async () => {
    const { context, target } = await downloadFixture();
    await writeFile(target, "existing");
    const exitCode = await executeCommand(context, () =>
      downloadAssetCommand(context, "a_1", { output: target, force: false }),
    );
    expect(exitCode).toBe(EXIT_CODES.validation);
    expect(await readFile(target, "utf8")).toBe("existing");
  });

  test("Req 5.4: --force overwrites the target", async () => {
    const { context, target } = await downloadFixture();
    await writeFile(target, "existing");
    await downloadAssetCommand(context, "a_1", { output: target, force: true });
    expect(await readFile(target, "utf8")).toBe("image-bytes");
  });
});

describe("assets upload", () => {
  async function makeFiles(count: number): Promise<string[]> {
    const directory = await mkdtemp(join(tmpdir(), "raster-upload-"));
    const files: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const path = join(directory, `file-${index}.png`);
      await writeFile(path, `bytes-${index}`);
      files.push(path);
    }
    return files;
  }

  test("Req 6.1 / Property 6: 45 files upload as 3 batches of at most 20", async () => {
    const { fetchImpl, requests } = createMockFetch(
      jsonRoute("POST", ASSETS_PATH, 200, dataEnvelope({ assets: [] })),
    );
    const { context } = await inLibrary(fetchImpl);
    const files = await makeFiles(45);
    await uploadAssetsCommand(context, files);
    expect(requests.length).toBe(3);
    const counts: number[] = [];
    for (const request of requests) {
      const formData = await request.formData();
      counts.push(formData.getAll("files").length);
    }
    expect(counts).toEqual([20, 20, 5]);
  });

  test("Req 6.2: a 413 surfaces the API message and exits 6", async () => {
    const { fetchImpl } = createMockFetch(
      jsonRoute("POST", ASSETS_PATH, 413, errorEnvelopeBody("PAYLOAD_TOO_LARGE", "File exceeds the size limit.")),
    );
    const { context, stderrLines } = await inLibrary(fetchImpl);
    const files = await makeFiles(1);
    const exitCode = await executeCommand(context, () => uploadAssetsCommand(context, files));
    expect(exitCode).toBe(EXIT_CODES.payloadTooLarge);
    expect(stderrLines.join("")).toContain("File exceeds the size limit.");
  });

  test("Req 6.1: an unreadable file is a usage error before any request", async () => {
    const { fetchImpl, requests } = createMockFetch();
    const { context } = await inLibrary(fetchImpl);
    const exitCode = await executeCommand(context, () =>
      uploadAssetsCommand(context, ["/nonexistent/missing.png"]),
    );
    expect(exitCode).toBe(EXIT_CODES.usage);
    expect(requests.length).toBe(0);
  });
});

describe("assets rm", () => {
  test("Req 6.3: more than 100 ids fails locally with no request", async () => {
    const { fetchImpl, requests } = createMockFetch();
    const { context } = await inLibrary(fetchImpl);
    const ids = Array.from({ length: 101 }, (_, index) => `a_${index}`);
    const exitCode = await executeCommand(context, () => removeAssetsCommand(context, ids, { yes: false }));
    expect(exitCode).toBe(EXIT_CODES.validation);
    expect(requests.length).toBe(0);
  });

  test("Req 6.3: interactive declined confirmation aborts without a request", async () => {
    const { fetchImpl, requests } = createMockFetch();
    const { context, stderrLines } = await createTestContext({
      fetch: fetchImpl,
      flagApiKey: TEST_API_KEY,
      org: ORG,
      library: LIBRARY,
      isInteractive: true,
      confirm: async () => false,
    });
    await removeAssetsCommand(context, ["a_1"], { yes: false });
    expect(requests.length).toBe(0);
    expect(stderrLines.join("")).toContain("Aborted.");
  });

  test("Req 6.3: --yes deletes without confirming", async () => {
    const { fetchImpl, requests } = createMockFetch(
      jsonRoute("DELETE", ASSETS_PATH, 200, dataEnvelope({ assets: [] })),
    );
    const { context } = await createTestContext({
      fetch: fetchImpl,
      flagApiKey: TEST_API_KEY,
      org: ORG,
      library: LIBRARY,
      isInteractive: true,
      confirm: async () => {
        throw new Error("confirm must not be called with --yes");
      },
    });
    await removeAssetsCommand(context, ["a_1", "a_2"], { yes: true });
    expect(requests.length).toBe(1);
    const body: unknown = JSON.parse((await requests[0]?.text()) ?? "");
    expect(body).toEqual({ ids: ["a_1", "a_2"] });
  });
});

describe("assets transfer", () => {
  test("Req 6.7: positional ids + --to send { targetLibraryId, assetIds }", async () => {
    const { fetchImpl, requests } = createMockFetch(
      jsonRoute("POST", `${ASSETS_PATH}/transfer`, 200, dataEnvelope({ assets: [] })),
    );
    const { context } = await inLibrary(fetchImpl);
    await transferAssetsCommand(context, ["a_1"], { to: "lib_2" });
    const body: unknown = JSON.parse((await requests[0]?.text()) ?? "");
    expect(body).toEqual({ targetLibraryId: "lib_2", assetIds: ["a_1"] });
  });
});