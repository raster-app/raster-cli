import { describe, expect, test } from "bun:test";
import {
  createMockFetch,
  createTestContext,
  dataEnvelope,
  jsonRoute,
  TEST_API_KEY,
} from "../test-support";
import { listTagsCommand, tagAssetsCommand, untagAssetsCommand } from "./tags";

const ORG = "org_1";
const LIBRARY = "lib_1";
const LIBRARY_PATH = `/organizations/${ORG}/libraries/${LIBRARY}`;

function inLibrary(fetchImpl: ReturnType<typeof createMockFetch>["fetchImpl"]) {
  return createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY, org: ORG, library: LIBRARY });
}

describe("tags ls", () => {
  test("Req 6.6: renders the returned tags and forwards --limit", async () => {
    const tags = [
      { id: "sunset", count: 4, type: "user" },
      { id: "beach", count: 2, type: "ai" },
    ];
    const { fetchImpl, requests } = createMockFetch(jsonRoute("GET", `${LIBRARY_PATH}/tags`, 200, dataEnvelope(tags)));
    const { context, stdoutLines } = await inLibrary(fetchImpl);
    await listTagsCommand(context, { limit: 10 });
    expect(new URL(requests[0]?.url ?? "").searchParams.get("limit")).toBe("10");
    const output = stdoutLines.join("");
    expect(output).toContain("sunset");
    expect(output).toContain("beach");
  });
});

describe("tags add / rm", () => {
  test("Req 6.5: add sends { assetIds, tags } to the tag endpoint, ids positional", async () => {
    const { fetchImpl, requests } = createMockFetch(
      jsonRoute("POST", `${LIBRARY_PATH}/assets/tag`, 200, dataEnvelope({ assets: [] })),
    );
    const { context } = await inLibrary(fetchImpl);
    await tagAssetsCommand(context, ["a_1", "a_2"], { tag: ["red"] });
    const body: unknown = JSON.parse((await requests[0]?.text()) ?? "");
    expect(body).toEqual({ assetIds: ["a_1", "a_2"], tags: ["red"] });
  });

  test("Req 6.5: rm sends the same shape to the untag endpoint", async () => {
    const { fetchImpl, requests } = createMockFetch(
      jsonRoute("POST", `${LIBRARY_PATH}/assets/untag`, 200, dataEnvelope({ assets: [] })),
    );
    const { context } = await inLibrary(fetchImpl);
    await untagAssetsCommand(context, ["a_1"], { tag: ["red"] });
    expect(new URL(requests[0]?.url ?? "").pathname).toBe(`${LIBRARY_PATH}/assets/untag`);
  });
});
