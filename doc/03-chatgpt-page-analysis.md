# ChatGPT Page Analysis (Observed)

Date: `2026-02-21`
Source: logged-in Chrome profile with remote debugging on `127.0.0.1:9222`

## Route Model

- Home route: `https://chatgpt.com/`
- Conversation route: `https://chatgpt.com/c/<conversation_id>`

## Home Page Findings

- Main history nav anchor: `nav[aria-label="Chat history"]`
- History container: `#history`
- Conversation links: `a[href^="/c/"]`
- Observed initial history links: `29`

## Conversation Page Findings

- Turn container: `article[data-testid^="conversation-turn-"]`
- Role anchor: `[data-message-author-role="user" | "assistant"]`
- Observed sample:
  - `64` role nodes
  - `64` article nodes
  - role breakdown `user:32`, `assistant:32`
- Assistant rich content usually appears in `.markdown.prose...`

## Composer Findings

- Form: `form.group\\/composer`
- Input nodes:
  - `textarea.wcDTda_fallbackTextarea`
  - `[contenteditable="true"].ProseMirror`
- Submit button labels can change by state; avoid relying on it for export logic.

## History Pagination Findings

- History is lazy-loaded with paged backend requests:
  - `/backend-api/conversations?offset=0&limit=28&...`
  - subsequent offsets: `28`, `56`, `84`, ...
- Conclusion: cannot rely on initially visible DOM only for batch export.

## API Observation (Risk Note)

- Page network requests for conversation data include headers such as:
  - `authorization`
  - `oai-device-id`
  - `oai-client-version`
- Direct raw fetch attempts from page context may return `conversation_not_found` in some conditions.
- Conclusion: private API calls are not a stable single source. Keep DOM-first extraction strategy.

## Export-Relevant DOM Anchors

- History list:
  - `nav[aria-label="Chat history"] #history a[href^="/c/"]`
- Message extraction:
  - `article[data-testid^="conversation-turn-"] [data-message-author-role]`
- Assistant structured content:
  - `.markdown.prose`
- Attachment-like images may use:
  - `/backend-api/estuary/content?...`

## Stability Strategy

- Primary selectors must be attribute-based, not class-only.
- Add fallback selector set for each critical extraction step.
- Maintain a small probe script to re-validate selectors after UI changes.
