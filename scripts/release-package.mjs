import path from "path";
import {
  PACKAGE_JSON_PATH,
  PROJECT_ROOT,
  createExtensionReleaseAssets,
  normalizeVersion,
  readJson
} from "./release-lib.mjs";

function main() {
  const input = process.argv[2] || readJson(PACKAGE_JSON_PATH).version;
  const version = normalizeVersion(input);
  const { zipPath, shaPath } = createExtensionReleaseAssets(version);

  console.log(`Created release asset: ${path.relative(PROJECT_ROOT, zipPath)}`);
  console.log(`Created checksum: ${path.relative(PROJECT_ROOT, shaPath)}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
