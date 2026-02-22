# Changelog

All notable changes to this project will be documented in this file.

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

