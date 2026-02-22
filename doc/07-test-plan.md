# 07 Test Plan

Last updated: `2026-02-22`

## Test Scope

1. Single conversation export
2. History loading and manual selection
3. Batch export ZIP
4. Error handling and connection recovery

## Automated Test (CDP / Chrome DevTools)

Precondition:

1. Chrome runs with remote debug port `9222`
2. Logged in to `chatgpt.com`
3. At least one conversation exists in history

Command:

```bash
cd chatgpt-conversation-archive
npm install
npm run test:cdp
```

Validates:

1. Navigation to chatgpt and conversation route works.
2. Current `content.js` extraction returns non-empty turns.
3. Assistant markdown output is non-empty.
4. Markdown syntax is preserved for detected DOM features (heading/list/bold/link/code/table).

Report:

- `tests/reports/cdp-markdown-smoke-report.json`

Latest local result:

- `2026-02-22`: `PASS`

## Automated Test (ZIP Integrity)

Command:

```bash
cd chatgpt-conversation-archive
npm run test:zip
```

Validates:

1. ZIP generation can package multiple markdown files.
2. Generated ZIP passes `unzip -t` integrity validation.

Report:

- `tests/reports/zip-archive-selftest-report.json`

Latest local result:

- `2026-02-22`: `PASS`

## Manual Test Cases

### TC-01 Single Export Basic

Steps:

1. Open `chatgpt.com/c/<id>`
2. Trigger single export

Expected:

- One `.md` file downloaded
- Includes conversation title and turns

### TC-02 Single Export Rich Content

Data requirements:

- Conversation containing lists, code blocks, links, quotes, and table (if possible)

Expected:

- Markdown formatting preserved with readable structure

### TC-03 History Load More

Steps:

1. Open history panel
2. Scroll ChatGPT sidebar history to load more items
3. Trigger `Load History Links` again

Expected:

- More history entries appear than initial view
- No duplicate IDs in final list

### TC-04 Batch Export Success

Steps:

1. Select 5-10 conversations
2. Trigger batch export

Expected:

- One `.zip` downloaded
- One `.md` per selected conversation

### TC-05 Batch Partial Failure

Setup:

- Include at least one problematic conversation state

Expected:

- Batch continues for other items
- Failed items are listed with reason

### TC-06 Connection Recovery

Steps:

1. Keep browser idle for a long period, or reload target tab during export
2. Retry export

Expected:

- Recovery path attempts reinject/retry automatically
- User sees actionable error if extraction still fails

### TC-07 Cancellation (Planned)

Status:

- Not implemented in UI yet

Expected after implementation:

- User can stop queue midway
- Completed items remain valid

### TC-08 Selection Persistence (Session)

Steps:

1. Load history and select several entries.
2. Close side panel and reopen it in the same browser session.

Expected:

- Selected entries are restored from `chrome.storage.session`.
- `Export Selected (ZIP)` enablement reflects selected items that are present in loaded history.

### TC-09 Pagination Interaction

Steps:

1. Load enough history entries to exceed one page.
2. Switch between pages with `Prev`/`Next`.
3. Change page size (10/20/50).
4. Click `Select Page` on one page and verify cross-page behavior.

Expected:

- Page index and range display are correct.
- List content updates by page without losing global selection state.
- `Select Page` only selects items in current page view.

## Coverage Gaps (Current)

1. No automated end-to-end batch export test (multi-conversation + ZIP result check).
2. No unit tests for markdown serializer helper functions.
3. No automation for cancellation behavior (feature pending).

## Regression Checklist

1. Message extraction still works after selector changes.
2. Markdown syntax remains preserved for rich assistant content.
3. Filename generation remains stable.
4. Side panel remains responsive during batch export attempts.
