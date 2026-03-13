import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PROJECT_ROOT = path.resolve(__dirname, "..");
export const PACKAGE_JSON_PATH = path.join(PROJECT_ROOT, "package.json");
export const PACKAGE_LOCK_PATH = path.join(PROJECT_ROOT, "package-lock.json");
export const README_PATH = path.join(PROJECT_ROOT, "README.md");
export const README_EN_PATH = path.join(PROJECT_ROOT, "README.en.md");
export const CHANGELOG_PATH = path.join(PROJECT_ROOT, "CHANGELOG.md");
export const MANIFEST_PATH = path.join(PROJECT_ROOT, "extension", "manifest.json");
export const EXTENSION_DIR = path.join(PROJECT_ROOT, "extension");
export const RELEASE_DIR = path.join(PROJECT_ROOT, "release");

export function normalizeVersion(value) {
  const normalized = String(value || "").trim().replace(/^v/i, "");
  if (!/^\d+\.\d+\.\d+$/.test(normalized)) {
    throw new Error(`Invalid version "${value}". Expected semver like 0.2.0.`);
  }
  return normalized;
}

export function versionTag(version) {
  return `v${normalizeVersion(version)}`;
}

export function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

export function writeText(filePath, value) {
  fs.writeFileSync(filePath, value, "utf8");
}

export function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

export function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function replaceReadmeVersion(text, version) {
  const pattern = /(## (?:当前版本|Current Version)\s*\n\s*\n- `v)([^`]+)(`)/;
  if (!pattern.test(text)) {
    throw new Error("Could not find the current version section in README.");
  }
  return text.replace(pattern, `$1${normalizeVersion(version)}$3`);
}

export function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || PROJECT_ROOT,
    encoding: "utf8",
    stdio: options.stdio || "pipe"
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error(
      [`Command failed: ${command} ${args.join(" ")}`, stderr, stdout].filter(Boolean).join("\n")
    );
  }

  return result.stdout?.trim() || "";
}

export function getAllTagsDescending() {
  const output = run("git", ["tag", "--list", "--sort=-version:refname"]);
  return output ? output.split("\n").map((line) => line.trim()).filter(Boolean) : [];
}

export function getPreviousTag(currentVersion) {
  const currentTag = versionTag(currentVersion);
  return getAllTagsDescending().find((tag) => tag !== currentTag) || "";
}

export function getLatestExistingTag() {
  return getAllTagsDescending()[0] || "";
}

export function getCommitSubjectsSince(tag) {
  const range = tag ? `${tag}..HEAD` : "HEAD";
  const output = run("git", ["log", "--reverse", "--format=%s", range]);
  return output ? output.split("\n").map((line) => line.trim()).filter(Boolean) : [];
}

export function stripCommitPrefix(subject) {
  return String(subject || "")
    .replace(/^[a-z]+(?:\([^)]+\))?!?:\s*/i, "")
    .trim();
}

export function categorizeCommit(subject) {
  const trimmed = String(subject || "").trim();
  if (/^feat(?:\(|:|!)/i.test(trimmed)) return "Added";
  if (/^fix(?:\(|:|!)/i.test(trimmed)) return "Fixed";
  return "Changed";
}

export function categorizeCommits(subjects) {
  const sections = {
    Added: [],
    Fixed: [],
    Changed: []
  };

  for (const subject of subjects) {
    const bucket = categorizeCommit(subject);
    sections[bucket].push(stripCommitPrefix(subject));
  }

  if (
    sections.Added.length === 0 &&
    sections.Fixed.length === 0 &&
    sections.Changed.length === 0
  ) {
    sections.Changed.push("Release preparation updates.");
  }

  return sections;
}

export function formatNumberedList(items) {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

export function buildChangelogSection(version, releaseDate, commitSubjects) {
  const normalizedVersion = normalizeVersion(version);
  const sections = categorizeCommits(commitSubjects);
  const parts = [`## [${normalizedVersion}] - ${releaseDate}`];

  for (const [title, items] of Object.entries(sections)) {
    if (items.length === 0) continue;
    parts.push(`### ${title}`);
    parts.push(formatNumberedList(items));
  }

  return `${parts.join("\n\n")}\n`;
}

export function findChangelogSectionRange(markdown, version) {
  const normalizedVersion = normalizeVersion(version);
  const heading = new RegExp(`^## \\[${escapeRegExp(normalizedVersion)}\\] - .*$`, "m");
  const match = heading.exec(markdown);
  if (!match || typeof match.index !== "number") {
    return null;
  }

  const start = match.index;
  const tail = markdown.slice(start + match[0].length);
  const nextMatch = /^## \[/m.exec(tail);
  const end = nextMatch && typeof nextMatch.index === "number"
    ? start + match[0].length + nextMatch.index
    : markdown.length;

  return { start, end };
}

export function extractChangelogSection(markdown, version) {
  const range = findChangelogSectionRange(markdown, version);
  return range ? markdown.slice(range.start, range.end).trim() : "";
}

export function upsertChangelogSection(markdown, version, section) {
  const range = findChangelogSectionRange(markdown, version);

  if (range) {
    return `${markdown.slice(0, range.start)}${section.trim()}\n\n${markdown.slice(range.end).trimStart()}`;
  }

  const firstEntryIndex = markdown.search(/^## \[/m);
  if (firstEntryIndex === -1) {
    return `${markdown.trimEnd()}\n\n${section.trim()}\n`;
  }

  return [
    markdown.slice(0, firstEntryIndex).trimEnd(),
    "",
    section.trim(),
    "",
    markdown.slice(firstEntryIndex).trimStart()
  ].join("\n");
}

export function buildReleaseNotes(version, { previousTag = "", changelogSection = "", commitSubjects = [] } = {}) {
  const normalizedVersion = normalizeVersion(version);
  const parts = [`# v${normalizedVersion}`];

  if (previousTag) {
    parts.push(`Changes since \`${previousTag}\`.`);
  }

  if (changelogSection) {
    const body = changelogSection.replace(/^## \[[^\]]+\] - .*\n*/m, "").trim();
    if (body) {
      parts.push(body);
    }
  } else {
    const sections = categorizeCommits(commitSubjects);
    for (const [title, items] of Object.entries(sections)) {
      if (items.length === 0) continue;
      parts.push(`## ${title}`);
      parts.push(formatNumberedList(items));
    }
  }

  return `${parts.join("\n\n")}\n`;
}

export function buildReleaseArtifactBaseName(packageName, version) {
  return `${String(packageName || "").trim()}-v${normalizeVersion(version)}-extension`;
}

export function updateVersionFiles(version) {
  const normalizedVersion = normalizeVersion(version);

  const packageJson = readJson(PACKAGE_JSON_PATH);
  packageJson.version = normalizedVersion;
  writeJson(PACKAGE_JSON_PATH, packageJson);

  const packageLock = readJson(PACKAGE_LOCK_PATH);
  packageLock.version = normalizedVersion;
  if (packageLock.packages?.[""]) {
    packageLock.packages[""].version = normalizedVersion;
  }
  writeJson(PACKAGE_LOCK_PATH, packageLock);

  const manifest = readJson(MANIFEST_PATH);
  manifest.version = normalizedVersion;
  writeJson(MANIFEST_PATH, manifest);

  const readme = readText(README_PATH);
  writeText(README_PATH, replaceReadmeVersion(readme, normalizedVersion));

  const readmeEn = readText(README_EN_PATH);
  writeText(README_EN_PATH, replaceReadmeVersion(readmeEn, normalizedVersion));
}

export function assertVersionConsistency(version) {
  const normalizedVersion = normalizeVersion(version);
  const packageVersion = normalizeVersion(readJson(PACKAGE_JSON_PATH).version);
  const lockVersion = normalizeVersion(readJson(PACKAGE_LOCK_PATH).version);
  const manifestVersion = normalizeVersion(readJson(MANIFEST_PATH).version);

  if (
    packageVersion !== normalizedVersion ||
    lockVersion !== normalizedVersion ||
    manifestVersion !== normalizedVersion
  ) {
    throw new Error(
      `Version mismatch. Expected ${normalizedVersion}, got package=${packageVersion}, lock=${lockVersion}, manifest=${manifestVersion}.`
    );
  }
}

export function ensureReleaseDir() {
  fs.mkdirSync(RELEASE_DIR, { recursive: true });
}

export function writeReleaseNotesFile(version, markdown) {
  ensureReleaseDir();
  const filePath = path.join(
    RELEASE_DIR,
    `${buildReleaseArtifactBaseName(readJson(PACKAGE_JSON_PATH).name, version)}-notes.md`
  );
  writeText(filePath, markdown);
  return filePath;
}

export function hashFileSha256(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

export function createExtensionReleaseAssets(version) {
  const normalizedVersion = normalizeVersion(version);
  assertVersionConsistency(normalizedVersion);
  ensureReleaseDir();

  const packageName = readJson(PACKAGE_JSON_PATH).name;
  const baseName = buildReleaseArtifactBaseName(packageName, normalizedVersion);
  const zipPath = path.join(RELEASE_DIR, `${baseName}.zip`);
  const shaPath = `${zipPath}.sha256`;

  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  if (fs.existsSync(shaPath)) fs.unlinkSync(shaPath);

  run("zip", ["-qr", zipPath, "."], { stdio: "inherit", cwd: EXTENSION_DIR });

  const digest = hashFileSha256(zipPath);
  writeText(shaPath, `${digest}  ${path.basename(zipPath)}\n`);

  return { zipPath, shaPath };
}

export function runNpmScript(scriptName) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  run(npmCommand, ["run", scriptName], { stdio: "inherit" });
}
