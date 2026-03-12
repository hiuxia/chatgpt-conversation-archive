# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2026-03-12

### Added

1. cache sidebar conversations for resilient folders
2. add conversation toc previews

## [0.2.0] - 2026-03-12

### Added

1. add ChatGPT sidebar folders with inline controls

### Changed

1. simplify README for end users
2. untrack docs and policy files
3. ignore docs and policy markdown files
4. rename product to ChatGPT Exporter
5. add chrome-devtools-mcp debug instructions
6. rename project to ChatGPT Voyager
7. automate release packaging and publishing

## [0.1.0] - 2026-02-22

### Added

1. Export current ChatGPT conversation to Markdown.
2. History loading from ChatGPT sidebar links.
3. Batch export selected conversations to ZIP.
4. Markdown serialization for headings, lists, links, emphasis, blockquotes, code blocks, and tables.
5. Connection recovery with ping + content script reinjection.
6. Extraction wait and retry/backoff hardening.
7. History load-more probing via bounded auto-scroll.
8. Side panel selection persistence in `chrome.storage.session`.
9. Pagination-based history browsing in side panel.
10. CDP smoke test and ZIP integrity self-test.

