# 08 Decision Log

## 2026-02-22 - Add History Auto-Scroll Load-More in Content Extraction

- Context:
  - DOM history extraction was limited to currently rendered links in sidebar.
  - Batch export preparation needs broader history coverage without private API dependency.
- Decision:
  - Add bounded auto-scroll probing in content script when extracting history links.
  - Stop on idle/no-growth rounds or timeout to avoid unbounded loops.
- Impact:
  - Better chance to collect conversations beyond initial visible page.
  - Runtime remains deterministic with explicit bounds.

## 2026-02-22 - Persist Selection in Session Storage

- Context:
  - Side panel close/reopen cleared selected IDs and interrupted batch prep flow.
- Decision:
  - Persist selected history IDs to `chrome.storage.session` and restore on panel init.
- Impact:
  - Better UX continuity within the same browser session.
  - Selection remains local and non-persistent across browser restarts (intentional).

## 2026-02-22 - Retry/Backoff for Non-Connection Extraction Failures

- Context:
  - Some extraction failures are transient (render timing/navigation context), not only messaging connection errors.
- Decision:
  - Add retry attempts with exponential backoff + jitter.
  - Reload background tab between attempts.
- Impact:
  - Reduced chance of one-shot transient failure causing full batch failure.
  - Slightly longer per-item worst-case latency when repeated retries occur.

## 2026-02-22 - Align Docs to Running No-Build Baseline

- Context:
  - Several docs still described planned TypeScript/Vite/shared-module architecture.
  - Running code is a no-build MV3 JavaScript implementation with direct files under `extension/`.
- Decision:
  - Treat current no-build implementation as primary documented baseline.
  - Keep TypeScript/build-tool migration as optional future work, not current state.
- Impact:
  - New agents can onboard against real code paths without architecture mismatch.
  - Planning remains clear about what is implemented vs future refactor.

## 2026-02-22 - Normalize Remaining Work Around Real Gaps

- Context:
  - Prior action lists still included already completed items (history selection model).
- Decision:
  - Reframe backlog to unresolved gaps only:
    - batch progress UI
    - batch cancellation
    - history load-more
    - selection persistence
    - fallback/retry hardening
- Impact:
  - Reduces duplicate work and handoff confusion.
  - Makes milestone tracking actionable.

## 2026-02-21 - Use DOM-First Extraction

- Context:
  - ChatGPT page structure and network behavior were probed in a logged-in session.
  - Direct private API fetch in page context showed unstable behavior (`conversation_not_found`) in some attempts.
- Decision:
  - Use DOM as the primary source of truth for export content.
  - Treat private API access as optional optimization, not a hard dependency.
- Impact:
  - Better stability against auth context mismatch.
  - Higher dependence on selector health; requires selector fallback strategy.

## 2026-02-21 - Project Name and Folder Convention

- Decision:
  - Product name: `ChatGPT Conversation Archive`
  - Root folder: `chatgpt-conversation-archive`
  - Documentation folder: `doc/`
- Impact:
  - Consistent naming for handoff and automation scripts.

## 2026-02-21 - Start with Single Export Before Batch

- Context:
  - Batch export depends on robust single extraction and markdown serialization.
- Decision:
  - Milestone priority is single-conversation export first.
- Impact:
  - Faster validation loop.
  - Lower debugging complexity in early iterations.

## 2026-02-21 - Keep Dedicated Debug Browser Profile

- Decision:
  - Use separate Chrome profile (`/tmp/chrome-mcp-chatgpt`) for all debugging.
- Impact:
  - Avoids contaminating personal browsing profile.
  - Improves reproducibility for agents and teammates.

## 2026-02-21 - Implement No-Build MV3 Skeleton First

- Context:
  - Team needed a runnable baseline quickly for iterative debugging.
  - Build tooling choice (Vite/esbuild/TypeScript) can be decided later.
- Decision:
  - Start with direct loadable extension files under `extension/` without build step.
  - Prioritize behavior validation over toolchain setup.
- Impact:
  - Faster MVP verification in `chrome://extensions`.
  - Future migration to TypeScript/build tooling remains possible.

## 2026-02-21 - MVP Includes Current Export + History Discovery

- Context:
  - Current project milestone requires momentum and visible working path.
- Decision:
  - Implement two initial actions in side panel:
    - export current conversation to markdown
    - load currently visible history links
- Impact:
  - Confirms end-to-end message passing (`sidepanel -> background -> content`).
  - Batch zip export remains the next major feature.

## 2026-02-21 - Add Messaging Self-Recovery for Long Idle Sessions

- Context:
  - Long-lived usage can trigger `tabs.sendMessage` connection errors when content context is recycled.
- Decision:
  - Add `PING` handshake.
  - On connection failure, auto-inject `content.js` via `chrome.scripting.executeScript` and retry.
- Impact:
  - Fewer user-facing "cannot connect" failures.
  - Requires `scripting` permission in manifest.

## 2026-02-21 - Implement ZIP Packaging Without Build Dependency

- Context:
  - Project currently uses a no-build extension setup for fast iteration.
- Decision:
  - Implement ZIP generation directly in background using a store-mode ZIP writer (CRC32 + central directory).
  - Add integrity self-test via `unzip -t`.
- Impact:
  - Batch export works without bundling external libraries.
  - Keep option open to migrate to JSZip later if advanced compression/features are needed.
