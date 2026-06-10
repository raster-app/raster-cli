import { describe, expect, test } from "bun:test";
import { applySecretByte, isYesAnswer } from "./prompts";

describe("isYesAnswer", () => {
  test("accepts y and yes in any case", () => {
    expect(isYesAnswer("y")).toBe(true);
    expect(isYesAnswer("YES")).toBe(true);
    expect(isYesAnswer(" yes ")).toBe(true);
  });

  test("rejects everything else, defaulting to no", () => {
    expect(isYesAnswer("")).toBe(false);
    expect(isYesAnswer("n")).toBe(false);
    expect(isYesAnswer("yep")).toBe(false);
  });
});

describe("applySecretByte", () => {
  test("accumulates printable bytes", () => {
    let value = "";
    for (const byte of Buffer.from("pk_abc")) {
      const result = applySecretByte(value, byte);
      value = result.value;
      expect(result.done).toBe(false);
    }
    expect(value).toBe("pk_abc");
  });

  test("backspace removes the last character", () => {
    const result = applySecretByte("pk_a", 127);
    expect(result.value).toBe("pk_");
    expect(result.done).toBe(false);
  });

  test("enter finishes without cancelling", () => {
    const result = applySecretByte("pk_a", 13);
    expect(result).toEqual({ value: "pk_a", done: true, cancelled: false });
  });

  test("Ctrl-C finishes as cancelled", () => {
    const result = applySecretByte("pk_a", 3);
    expect(result.done).toBe(true);
    expect(result.cancelled).toBe(true);
  });

  test("other control bytes are ignored", () => {
    const result = applySecretByte("pk_a", 27);
    expect(result).toEqual({ value: "pk_a", done: false, cancelled: false });
  });
});
