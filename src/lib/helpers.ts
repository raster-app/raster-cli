export const MAX_UPLOAD_FILES = 20;
export const MAX_TAGS_PER_QUERY = 5;
export const MAX_DELETE_IDS = 100;

const VISIBLE_KEY_PREFIX_LENGTH = 6;

export function maskApiKey(key: string): string {
  return `${key.slice(0, VISIBLE_KEY_PREFIX_LENGTH)}…`;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

const CONTENT_TYPES_BY_EXTENSION: Record<string, string> = {
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  heic: "image/heic",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
  webp: "image/webp",
};
const FALLBACK_CONTENT_TYPE = "application/octet-stream";

export function contentTypeForFilename(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex === -1) return FALLBACK_CONTENT_TYPE;
  const extension = filename.slice(dotIndex + 1).toLowerCase();
  return CONTENT_TYPES_BY_EXTENSION[extension] ?? FALLBACK_CONTENT_TYPE;
}

const BYTE_UNITS = ["KB", "MB", "GB", "TB"];

export function formatBytes(size: number | null | undefined): string {
  if (typeof size !== "number" || !Number.isFinite(size) || size < 0) return "";
  if (size < 1024) return `${size} B`;
  let value = size;
  let unitIndex = -1;
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const unit = BYTE_UNITS[unitIndex] ?? "TB";
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
}
