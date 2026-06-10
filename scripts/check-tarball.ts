import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { z } from "zod";

const ALLOWED_PATH_PATTERNS = [/^dist\//, /^package\.json$/, /^README\.md$/, /^LICENSE$/, /^NOTICE$/];

const packOutputSchema = z.array(
  z.object({ files: z.array(z.object({ path: z.string() })) }),
);

if (!existsSync(new URL("../dist/index.js", import.meta.url))) {
  console.error("dist/index.js missing — run `bun run build` before the tarball check.");
  process.exit(1);
}

// --ignore-scripts keeps prepack's build output out of the JSON stream.
const rawOutput = execFileSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
  encoding: "utf8",
});
const packEntries = packOutputSchema.parse(JSON.parse(rawOutput));
const filePaths = packEntries.flatMap((entry) => entry.files.map((file) => file.path));
const offenders = filePaths.filter(
  (path) => !ALLOWED_PATH_PATTERNS.some((pattern) => pattern.test(path)),
);

if (offenders.length > 0) {
  console.error("Tarball purity check failed. Unexpected files:");
  for (const offender of offenders) {
    console.error(`  ${offender}`);
  }
  process.exit(1);
}
console.log(`Tarball purity OK — ${filePaths.length} files, dist + metadata only.`);
