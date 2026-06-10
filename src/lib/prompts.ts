import { createInterface } from "node:readline";

const YES_PATTERN = /^y(es)?$/i;

export function isYesAnswer(answer: string): boolean {
  return YES_PATTERN.test(answer.trim());
}

export function promptConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const readline = createInterface({ input: process.stdin, output: process.stderr });
    readline.question(`${message} [y/N] `, (answer) => {
      readline.close();
      resolve(isYesAnswer(answer));
    });
  });
}

const BYTE_CTRL_C = 3;
const BYTE_BACKSPACE_DELETE = 127;
const BYTE_BACKSPACE = 8;
const BYTE_CARRIAGE_RETURN = 13;
const BYTE_LINE_FEED = 10;
const FIRST_PRINTABLE_BYTE = 32;

export type SecretByteResult = {
  value: string;
  done: boolean;
  cancelled: boolean;
};

// API keys are ASCII, so byte-wise handling is safe here.
export function applySecretByte(value: string, byte: number): SecretByteResult {
  if (byte === BYTE_CTRL_C) return { value, done: true, cancelled: true };
  if (byte === BYTE_CARRIAGE_RETURN || byte === BYTE_LINE_FEED) {
    return { value, done: true, cancelled: false };
  }
  if (byte === BYTE_BACKSPACE_DELETE || byte === BYTE_BACKSPACE) {
    return { value: value.slice(0, -1), done: false, cancelled: false };
  }
  if (byte < FIRST_PRINTABLE_BYTE) return { value, done: false, cancelled: false };
  return { value: value + String.fromCharCode(byte), done: false, cancelled: false };
}

export function promptSecret(message: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = process.stdin;
    const output = process.stderr;
    if (!input.isTTY) {
      resolve(null);
      return;
    }
    output.write(`${message}: `);
    input.setRawMode(true);
    input.resume();
    let value = "";
    const onData = (chunkBytes: Buffer): void => {
      for (const byte of chunkBytes) {
        const result = applySecretByte(value, byte);
        value = result.value;
        if (result.done) {
          input.setRawMode(false);
          input.pause();
          input.off("data", onData);
          output.write("\n");
          resolve(result.cancelled || value.length === 0 ? null : value);
          return;
        }
      }
    };
    input.on("data", onData);
  });
}
