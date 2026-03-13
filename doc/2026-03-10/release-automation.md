# Release Automation

Date: `2026-03-13`
Status: `active`
Owner: `maintainers`

## Purpose

This project ships with a local release-preparation script and a GitHub Actions publishing workflow.

The goals are:

1. Keep version files in sync
2. Generate release notes from the changelog
3. Run release validation before tagging
4. Build the extension ZIP and checksum automatically
5. Publish GitHub Releases from tags

## Local Preparation

Run:

```bash
npm run release:prepare -- <version>
```

Example:

```bash
npm run release:prepare -- 0.4.0
```

By default, the script will:

1. Update `package.json`
2. Update `package-lock.json`
3. Update `extension/manifest.json`
4. Update `README.md`
5. Update `README.zh-CN.md`
6. Generate or refresh the matching `CHANGELOG.md` section
7. Run release validation:
   - `npm run test:release`
   - `npm run test:content-dom`
   - `npm run test:toc`
   - `npm run test:folders`
   - `npm run test:markdown`
   - `npm run test:zip`
8. Build local release assets in `release/`

If you also want to include the CDP smoke test:

```bash
npm run release:prepare -- <version> --with-cdp
```

## Release Assets

The preparation step creates:

1. Extension ZIP
2. SHA-256 checksum
3. Generated release notes preview

These files are written into the repository `release/` directory.

## Publish Flow

After the local preparation step succeeds:

```bash
git add README.md README.zh-CN.md CHANGELOG.md extension/manifest.json package.json package-lock.json
git commit -m "release: prepare v<version>"
git tag -a v<version> -m "Release v<version>"
git push origin main v<version>
```

## GitHub Actions Workflow

The repository includes `.github/workflows/release.yml`.

That workflow:

1. Listens for `v*` tag pushes
2. Installs dependencies
3. Runs release validation tests
4. Rebuilds the extension ZIP and checksum
5. Builds release notes from `CHANGELOG.md`
6. Creates the GitHub Release
7. Uploads the generated assets

## Maintainer Notes

1. Keep `README.md` and `README.zh-CN.md` lightweight; detailed release instructions belong here.
2. If the workflow fails on release notes generation, check that `CHANGELOG.md` is committed and up to date.
3. If you move or rename release scripts, update both this document and `.github/workflows/release.yml`.
