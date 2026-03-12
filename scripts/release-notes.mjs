import {
  CHANGELOG_PATH,
  buildReleaseNotes,
  extractChangelogSection,
  getCommitSubjectsSince,
  getPreviousTag,
  normalizeVersion,
  readText,
  writeText
} from "./release-lib.mjs";

function parseArgs(argv) {
  let version = "";
  let output = "";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output") {
      output = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (!version) {
      version = arg;
    }
  }

  if (!version) {
    throw new Error("Usage: npm run release:notes -- <version> [--output <file>]");
  }

  return {
    version: normalizeVersion(version),
    output
  };
}

function main() {
  const { version, output } = parseArgs(process.argv.slice(2));
  const changelog = readText(CHANGELOG_PATH);
  const changelogSection = extractChangelogSection(changelog, version);
  const previousTag = getPreviousTag(version);
  const commitSubjects = previousTag ? getCommitSubjectsSince(previousTag) : [];
  const notes = buildReleaseNotes(version, {
    previousTag,
    changelogSection,
    commitSubjects
  });

  if (output) {
    writeText(output, notes);
    console.log(`Wrote release notes to ${output}`);
    return;
  }

  process.stdout.write(notes);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
