# Developer Instructions

## Core Principles

- DOM-first extraction strategy. Do not rely on private API as the only data source.
- Keep all export processing local by default.
- Minimize extension permissions.
- Prefer stable selectors over class-based selectors.

## Selector Priority

1. History links: `nav[aria-label="Chat history"] #history a[href^="/c/"]`
2. Message nodes: `[data-message-author-role]`
3. Turn containers: `article[data-testid^="conversation-turn-"]`
4. Assistant markdown block: `.markdown.prose` (fallback: `[class*="markdown"]`)

## Data Extraction Rules

- User messages: extract from `[data-message-author-role="user"]` text content.
- Assistant messages: parse structured block (markdown DOM) first, fallback to text.
- Preserve code fences, lists, blockquotes, tables, and links where available.
- Detect attachment images and include source URL metadata in export.

## Batch Export Rules

- Build queue with limited concurrency (`2-4` workers).
- Track task states: `pending`, `running`, `success`, `failed`.
- Continue on per-item failure and produce final error report.
- Support cancellation during batch run.

## Error Handling

- Detect selector miss and switch to fallback strategy.
- Add retry for transient page state failures.
- Surface actionable error messages in side panel UI.

## Security and Privacy

- No remote upload of conversation content.
- No sensitive logging (tokens, full cookies, raw auth headers).
- Keep analytics disabled in early versions.

## Definition of Done (Per Feature)

- Single export: expected markdown is generated and downloaded.
- Batch export: selected conversations are exported to ZIP with correct filenames.
- Regression check: no breakage on basic chat page navigation.
