const path = require("path");
const { pathToFileURL } = require("url");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  const modulePath = pathToFileURL(
    path.join(__dirname, "..", "scripts", "release-lib.mjs")
  ).href;
  const lib = await import(modulePath);

  assert(lib.normalizeVersion("v0.2.0") === "0.2.0", "Version normalization should strip leading v.");
  assert(
    lib.buildReleaseArtifactBaseName("chatgpt-voyager", "0.2.0") ===
      "chatgpt-voyager-v0.2.0-extension",
    "Release artifact name should include package slug and version."
  );

  const changelogSection = lib.buildChangelogSection("0.2.0", "2026-03-12", [
    "feat: add sidebar folders",
    "fix: keep menu panel anchored",
    "docs: rename project to ChatGPT Voyager"
  ]);

  assert(
    changelogSection.includes("## [0.2.0] - 2026-03-12"),
    "Changelog section should contain the version heading."
  );
  assert(changelogSection.includes("### Added"), "Feature commits should land in Added.");
  assert(changelogSection.includes("### Fixed"), "Fix commits should land in Fixed.");
  assert(changelogSection.includes("### Changed"), "Docs/chore commits should land in Changed.");

  const readme = "## 当前版本\n\n- `v0.1.0`\n";
  assert(
    lib.replaceReadmeVersion(readme, "0.2.0").includes("`v0.2.0`"),
    "README version replacement should update the displayed version."
  );

  const changelog = `# Changelog\n\n## [0.2.0] - 2026-03-12\n\n### Added\n\n1. Sidebar folders.\n\n## [0.1.0] - 2026-02-22\n`;
  const extracted = lib.extractChangelogSection(changelog, "0.2.0");
  assert(
    extracted.includes("Sidebar folders."),
    "Changelog extraction should return the requested release section."
  );

  const notes = lib.buildReleaseNotes("0.2.0", {
    previousTag: "v0.1.0",
    changelogSection: extracted
  });
  assert(notes.startsWith("# v0.2.0"), "Release notes should start with the version heading.");
  assert(
    notes.includes("Changes since `v0.1.0`."),
    "Release notes should include the previous tag context when available."
  );

  console.log("[PASS] Release library self-test passed.");
}

run().catch((error) => {
  console.error("[FAIL] Release library self-test failed.");
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
