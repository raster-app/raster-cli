import { describe, expect, test } from "bun:test";
import {
  chunk,
  contentTypeForFilename,
  formatBytes,
  maskApiKey,
  MAX_UPLOAD_FILES,
} from "./helpers";

describe("maskApiKey", () => {
  test("Req 2.7: masks everything past the first 6 characters", () => {
    const key = `pk_${"a".repeat(45)}`;
    const masked = maskApiKey(key);
    expect(masked).toBe("pk_aaa…");
    expect(masked).not.toContain(key.slice(6));
  });
});

describe("chunk", () => {
  // Property 6: ⌈N / MAX_UPLOAD_FILES⌉ batches, each within the cap, order preserved.
  test("Property 6: splits 45 items into 3 batches of at most 20", () => {
    const items = Array.from({ length: 45 }, (_, index) => index);
    const batches = chunk(items, MAX_UPLOAD_FILES);
    expect(batches.length).toBe(3);
    expect(batches.map((batch) => batch.length)).toEqual([20, 20, 5]);
    expect(batches.flat()).toEqual(items);
  });

  test("Property 6: a list within the cap stays one batch", () => {
    expect(chunk([1, 2, 3], MAX_UPLOAD_FILES)).toEqual([[1, 2, 3]]);
  });

  test("Property 6: an empty list produces no batches", () => {
    expect(chunk([], MAX_UPLOAD_FILES)).toEqual([]);
  });
});

describe("contentTypeForFilename", () => {
  test("maps common image extensions", () => {
    expect(contentTypeForFilename("photo.JPG")).toBe("image/jpeg");
    expect(contentTypeForFilename("photo.png")).toBe("image/png");
    expect(contentTypeForFilename("photo.webp")).toBe("image/webp");
  });

  test("falls back to octet-stream for unknown or missing extensions", () => {
    expect(contentTypeForFilename("archive.zip")).toBe("application/octet-stream");
    expect(contentTypeForFilename("noextension")).toBe("application/octet-stream");
  });
});

describe("formatBytes", () => {
  test("renders human-readable sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  test("renders blank for missing values", () => {
    expect(formatBytes(null)).toBe("");
    expect(formatBytes(undefined)).toBe("");
  });
});
