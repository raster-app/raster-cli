import { describe, expect, test } from "bun:test";
import {
  createMockFetch,
  createTestContext,
  dataEnvelope,
  jsonRoute,
  TEST_API_KEY,
} from "../test-support";
import { listTagsCommand } from "./tags";

const TAGS_PATH = "/organizations/org_1/libraries/lib_1/tags";

describe("tags ls", () => {
  test("Req 6.6: renders the returned tags and forwards --limit", async () => {
    const tags = [
      { id: "sunset", count: 4, type: "user" },
      { id: "beach", count: 2, type: "ai" },
    ];
    const { fetchImpl, requests } = createMockFetch(jsonRoute("GET", TAGS_PATH, 200, dataEnvelope(tags)));
    const { context, stdoutLines } = await createTestContext({ fetch: fetchImpl, flagApiKey: TEST_API_KEY });
    await listTagsCommand(context, { org: "org_1", library: "lib_1", limit: 10 });
    expect(new URL(requests[0]?.url ?? "").searchParams.get("limit")).toBe("10");
    const output = stdoutLines.join("");
    expect(output).toContain("sunset");
    expect(output).toContain("beach");
  });
});
