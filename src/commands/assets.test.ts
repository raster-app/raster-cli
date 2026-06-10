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
import { tagAssetsCommand, untagAssetsCommand } from "./tags";

const ORG = "org_1";
const LIBRARY = "lib_1";
const ASSETS_PATH = `/organizations/${ORG}/libraries/${LIBRARY}/assets`;
const IN_LIBRARY = { org: ORG, library: LIBRARY };

describe("assets ls", () => {
  test("Req 5.1: forwards pagination and comma-joins tag filters", async () => {
    const { fetchImpl, requests } = createMockFetch(jsonRoute("GET", ASSETS_PATH, 200, dataEnvelope([])));
    const { context } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY });
    await listAssetsCommand(context, { ...IN_LIBRARY, page: 2, pageSize: 10, tag: ["red", "blue"] });
    const url = new URL(requests[0]?.url ?? "");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("pageSize")).toBe("10");
    expect(url.searchParams.get("tags")).toBe("red,blue");
  });

  test("Req 5.1: more than 5 tag filters fails locally with no request", async () => {
    const { fetchImpl, requests } = createMockFetch();
    const { context } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY });
    const exitCode = await executeCommand(context, () =>
      listAssetsCommand(context, { ...IN_LIBRARY, tag: ["a", "b", "c", "d", "e", "f"] }),
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
    const { context, stderrLines } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY });
    const exitCode = await executeCommand(context, () => getAssetCommand(context, "a_missing", IN_LIBRARY));
    expect(exitCode).toBe(EXIT_CODES.notFound);
    expect(stderrLines.join("")).toContain("Asset not found.");
  });
});

describe("assets search", () => {
  test("Req 5.3: sends q and comma-joins --library values", async () => {
    const { fetchImpl, requests } = createMockFetch(
      jsonRoute("GET", `/organizations/${ORG}/search/assets`, 200, dataEnvelope({ hits: [], found: 0, page: 1 })),
    );
    const { context } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY });
    await searchAssetsCommand(context, "sunset", { org: ORG, library: ["lib_1", "lib_2"] });
    const url = new URL(requests[0]?.url ?? "");
    expect(url.searchParams.get("q")).toBe("sunset");
    expect(url.searchParams.get("libraries")).toBe("lib_1,lib_2");
  });
});

describe("assets download", () => {
  async function downloadFixture() {
    const directory = await mkdtemp(join(tmpdir(), "raster-download-"));
    const target = join(directory, "photo.png");
    const asset = { id: "a_1", name: "photo.png", url: "https://api.raster.test/cdn/a_1" };
    const { fetchImpl } = createMockFetch(
      jsonRoute("GET", `${ASSETS_PATH}/a_1`, 200, dataEnvelope(asset)),
      rawRoute("GET", "/cdn/a_1", () => new Response("image-bytes", { status: 200 })),
    );
    const { context } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY });
    return { context, target };
  }

  test("Req 5.4: downloads the asset's url field to the target path", async () => {
    const { context, target } = await downloadFixture();
    await downloadAssetCommand(context, "a_1", { ...IN_LIBRARY, output: target, force: false });
    expect(await readFile(target, "utf8")).toBe("image-bytes");
  });

  test("Req 5.4: refuses to overwrite without --force", async () => {
    const { context, target } = await downloadFixture();
    await writeFile(target, "existing");
    const exitCode = await executeCommand(context, () =>
      downloadAssetCommand(context, "a_1", { ...IN_LIBRARY, output: target, force: false }),
    );
    expect(exitCode).toBe(EXIT_CODES.validation);
    expect(await readFile(target, "utf8")).toBe("existing");
  });

  test("Req 5.4: --force overwrites the target", async () => {
    const { context, target } = await downloadFixture();
    await writeFile(target, "existing");
    await downloadAssetCommand(context, "a_1", { ...IN_LIBRARY, output: target, force: true });
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
    const { context } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY });
    const files = await makeFiles(45);
    await uploadAssetsCommand(context, files, IN_LIBRARY);
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
    const { context, stderrLines } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY });
    const files = await makeFiles(1);
    const exitCode = await executeCommand(context, () => uploadAssetsCommand(context, files, IN_LIBRARY));
    expect(exitCode).toBe(EXIT_CODES.payloadTooLarge);
    expect(stderrLines.join("")).toContain("File exceeds the size limit.");
  });

  test("Req 6.1: an unreadable file is a usage error before any request", async () => {
    const { fetchImpl, requests } = createMockFetch();
    const { context } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY });
    const exitCode = await executeCommand(context, () =>
      uploadAssetsCommand(context, ["/nonexistent/missing.png"], IN_LIBRARY),
    );
    expect(exitCode).toBe(EXIT_CODES.usage);
    expect(requests.length).toBe(0);
  });
});

describe("assets rm", () => {
  test("Req 6.3: more than 100 ids fails locally with no request", async () => {
    const { fetchImpl, requests } = createMockFetch();
    const { context } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY });
    const ids = Array.from({ length: 101 }, (_, index) => `a_${index}`);
    const exitCode = await executeCommand(context, () =>
      removeAssetsCommand(context, ids, { ...IN_LIBRARY, yes: false }),
    );
    expect(exitCode).toBe(EXIT_CODES.validation);
    expect(requests.length).toBe(0);
  });

  test("Req 6.3: interactive declined confirmation aborts without a request", async () => {
    const { fetchImpl, requests } = createMockFetch();
    const { context, stderrLines } = await createTestContext({
      fetch: fetchImpl,
      flagApiKey: TEST_API_KEY,
      isInteractive: true,
      confirm: async () => false,
    });
    await removeAssetsCommand(context, ["a_1"], { ...IN_LIBRARY, yes: false });
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
      isInteractive: true,
      confirm: async () => {
        throw new Error("confirm must not be called with --yes");
      },
    });
    await removeAssetsCommand(context, ["a_1", "a_2"], { ...IN_LIBRARY, yes: true });
    expect(requests.length).toBe(1);
    const body: unknown = JSON.parse(await requests[0]?.text() ?? "");
    expect(body).toEqual({ ids: ["a_1", "a_2"] });
  });
});

describe("tags add / rm", () => {
  test("Req 6.5: tag sends { assetIds, tags } to the tag endpoint", async () => {
    const { fetchImpl, requests } = createMockFetch(
      jsonRoute("POST", `${ASSETS_PATH}/tag`, 200, dataEnvelope({ assets: [] })),
    );
    const { context } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY });
    await tagAssetsCommand(context, { ...IN_LIBRARY, asset: ["a_1"], tag: ["red"] });
    const body: unknown = JSON.parse(await requests[0]?.text() ?? "");
    expect(body).toEqual({ assetIds: ["a_1"], tags: ["red"] });
  });

  test("Req 6.5: untag sends the same shape to the untag endpoint", async () => {
    const { fetchImpl, requests } = createMockFetch(
      jsonRoute("POST", `${ASSETS_PATH}/untag`, 200, dataEnvelope({ assets: [] })),
    );
    const { context } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY });
    await untagAssetsCommand(context, { ...IN_LIBRARY, asset: ["a_1"], tag: ["red"] });
    expect(new URL(requests[0]?.url ?? "").pathname).toBe(`${ASSETS_PATH}/untag`);
  });
});

describe("assets transfer", () => {
  test("Req 6.7: sends { targetLibraryId, assetIds }", async () => {
    const { fetchImpl, requests } = createMockFetch(
      jsonRoute("POST", `${ASSETS_PATH}/transfer`, 200, dataEnvelope({ assets: [] })),
    );
    const { context } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY });
    await transferAssetsCommand(context, { ...IN_LIBRARY, to: "lib_2", asset: ["a_1"] });
    const body: unknown = JSON.parse(await requests[0]?.text() ?? "");
    expect(body).toEqual({ targetLibraryId: "lib_2", assetIds: ["a_1"] });
  });
});
