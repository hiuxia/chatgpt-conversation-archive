import path from "path";
import {
  CHANGELOG_PATH,
  PROJECT_ROOT,
  README_PATH,
  buildChangelogSection,
  buildReleaseNotes,
  createExtensionReleaseAssets,
  getCommitSubjectsSince,
  getLatestExistingTag,
  getTodayIsoDate,
  normalizeVersion,
  readText,
  runNpmScript,
  updateVersionFiles,
  upsertChangelogSection,
  versionTag,
  writeReleaseNotesFile,
  writeText
} from "./release-lib.mjs";

function parseArgs(argv) {
  let version = "";
  let withCdp = false;

  for (const arg of argv) {
    if (arg === "--with-cdp") {
      withCdp = true;
      continue;
    }
    if (!version) {
      version = arg;
    }
  }

  if (!version) {
    throw new Error("Usage: npm run release:prepare -- <version> [--with-cdp]");
  }

  return {
    version: normalizeVersion(version),
    withCdp
  };
}

function updateChangelog(version, commitSubjects) {
  const releaseDate = getTodayIsoDate();
  const nextSection = buildChangelogSection(version, releaseDate, commitSubjects);
  const changelog = readText(CHANGELOG_PATH);
  writeText(CHANGELOG_PATH, upsertChangelogSection(changelog, version, nextSection));
  return nextSection;
}

function runReleaseValidation(withCdp) {
  const scripts = ["test:release", "test:toc"];
  if (withCdp) {
    scripts.push("test:cdp");
  }

  for (const scriptName of scripts) {
    runNpmScript(scriptName);
  }
}

function main() {
  const { version, withCdp } = parseArgs(process.argv.slice(2));
  const previousTag = getLatestExistingTag();
  const commitSubjects = getCommitSubjectsSince(previousTag);

  if (commitSubjects.length === 0) {
    throw new Error(
      `No commits found since ${previousTag || "the repository root"}. Refusing to prepare an empty release.`
    );
  }

  updateVersionFiles(version);
  const changelogSection = updateChangelog(version, commitSubjects);
  runReleaseValidation(withCdp);

  const notes = buildReleaseNotes(version, {
    previousTag,
    changelogSection,
    commitSubjects
  });
  const notesPath = writeReleaseNotesFile(version, notes);
  const { zipPath, shaPath } = createExtensionReleaseAssets(version);

  const relNotes = path.relative(PROJECT_ROOT, notesPath);
  const relZip = path.relative(PROJECT_ROOT, zipPath);
  const relSha = path.relative(PROJECT_ROOT, shaPath);

  console.log(`Prepared release v${version}.`);
  console.log(`Generated notes: ${relNotes}`);
  console.log(`Generated asset: ${relZip}`);
  console.log(`Generated checksum: ${relSha}`);
  console.log("Next steps:");
  console.log(
    `  git add README.md README.zh-CN.md CHANGELOG.md extension/manifest.json package.json package-lock.json`
  );
  console.log(`  git commit -m "release: prepare v${version}"`);
  console.log(`  git tag -a ${versionTag(version)} -m "Release ${versionTag(version)}"`);
  console.log(`  git push origin main ${versionTag(version)}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
