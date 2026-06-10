import { writeFile } from "node:fs/promises";
import openapiTS, { astToString } from "openapi-typescript";

const DEFAULT_OPENAPI_URL = "https://api.raster.app/openapi.json";

const source = process.env.OPENAPI_URL ?? DEFAULT_OPENAPI_URL;
const outputPath = new URL("../src/api/openapi.d.ts", import.meta.url);

const ast = await openapiTS(new URL(source));
await writeFile(outputPath, astToString(ast));
console.log(`Generated ${outputPath.pathname} from ${source}`);
