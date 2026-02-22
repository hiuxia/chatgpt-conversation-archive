# Implementation Plan

Last aligned with source code: `2026-02-22`

## Milestone 1: MVP Single Export

Status: `completed`

Goal: Export the current conversation to Markdown from an active `chatgpt.com/c/...` tab.

Implemented:

1. Content script extraction for role-based messages.
2. DOM-to-Markdown serialization for assistant rich text.
3. Background download flow for `.md` export.
4. Side panel action: `Export Current Conversation`.

Exit criteria:

- A valid `.md` file downloads for current conversation.
- Filename includes date, conversation title, and ID.

## Milestone 2: History Selection UI

Status: `completed`

Goal: Show conversation history in extension side panel and allow manual multi-select.

Implemented:

1. History loader from sidebar DOM links.
2. Search/filter in side panel.
3. Checkbox selection with select-visible and clear-selection actions.
4. History load-more via auto-scroll probing in content script.
5. Selection persistence in `chrome.storage.session`.
6. Pagination-based history browsing in side panel (prev/next + page size).

Exit criteria:

- User can see and select many conversations beyond first loaded page.
- Selection remains stable across side panel reopen in same browser session.

## Milestone 3: Batch Export ZIP

Status: `partially completed`

Goal: Export selected conversations in batch.

Implemented:

1. Selected conversation queue normalization and dedup.
2. Background tab open -> wait ready -> extract -> close flow per item.
3. Markdown generation per conversation.
4. ZIP packaging and download.
5. Failure summary returned to side panel.

Pending:

1. Live progress updates during batch run (running/completed/failed counts).
2. User cancellation for in-flight jobs.

Exit criteria:

- ZIP contains one markdown file per selected conversation.
- User sees live progress and can cancel safely.

## Milestone 4: Hardening

Status: `partially completed`

Goal: Improve resilience and maintainability.

Implemented:

1. Content-script `PING` health check.
2. Auto reinject + retry on messaging connection loss.
3. Wait-for-tab-ready before messaging background tabs.
4. Wait-for-turns render loop in content extraction path.
5. Selector fallback map for key extraction paths.
6. Retry/backoff for non-connection extraction failures with tab reload between attempts.

Pending:

1. Runtime health diagnostics reporting in side panel (structured, not only free-form error text).
2. Unit tests for markdown serialization logic.
3. Batch E2E automation coverage.

Exit criteria:

- Export still works after minor UI changes.
- Test baseline covers core extraction and markdown behavior.

## Milestone 5: Release Readiness

Status: `not started`

Goal: Prepare for external usage.

Tasks:

1. Permission review and privacy statement.
2. User-facing docs and troubleshooting guide.
3. Semantic versioning and changelog.
4. Packaging and install validation checklist.

Exit criteria:

- Extension package is installable and documented.

## Technical Flow Summary

1. Collect candidate conversation links from active ChatGPT tab.
2. Resolve selected items to canonical `/c/<id>` URLs.
3. For each conversation:
   - Open background tab
   - Wait until tab and page are extraction-ready
   - Extract role turns and attachments
   - Convert to markdown
4. Aggregate files.
5. Download single `.md` or batch `.zip`.
