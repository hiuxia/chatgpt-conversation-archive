[English](./README.md) | [简体中文](./README.zh-CN.md)

# ChatGPT Voyager

`ChatGPT Voyager` is a Chrome extension for `chatgpt.com` built around three high-frequency workflows:

- Organize chat history with nested folders inside ChatGPT's native left sidebar
- Preview and navigate long conversations with a dot-based table of contents on the right side
- Export the current conversation or selected history items to Markdown / ZIP

These features are implemented as a local extension layer and do not modify ChatGPT server-side data.

## Current Capabilities

### Sidebar Organization

- Add a `Folders` section to ChatGPT's native left sidebar
- Support nested folders
- Create, rename, and delete folders inline
- Drag chats into any folder level, or drag them back to `Your chats`
- Cache seen conversation metadata locally so folder rendering depends less on the native history DOM

### Conversation Reading

- Show a collapsible TOC entry on conversation pages
- Preview assistant answers through dots before deciding to jump
- Extract per-answer sections from assistant Markdown headings

### Export and Release

- Export the current conversation to Markdown
- Export selected history items to ZIP
- Ship with release automation scripts and a GitHub Actions publishing flow

## Install

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the [extension/](./extension) directory from this repository
5. Open `https://chatgpt.com` and sign in
6. Refresh the page and confirm that `Folders` appears in the left sidebar
7. Open the `ChatGPT Voyager` side panel when you want to export conversations

## Usage

### 1. Organize chats with sidebar folders

1. Find `Folders` in the ChatGPT left sidebar
2. Click `New folder` to create a top-level folder
3. Use the `...` menu on a folder row to:
   - `Rename`
   - `Delete`
   - `New subfolder`
4. Drag conversation rows into the target folder
5. Drag a folder into another folder to create a nested tree

Notes:

- Folders are local to the extension and do not sync to your ChatGPT account
- Deleting a parent folder does not delete conversations; child folders are promoted one level up
- Previously cached conversations can still appear inside folders even when the native history list has not fully reloaded yet

### 2. Preview long conversations with the right-side TOC

1. Open any ChatGPT conversation page (`/c/<id>`)
2. Click the right-side TOC button (`目录`)
3. Click a dot to preview the corresponding assistant answer
4. Use the preview card to inspect:
   - the prefix of the preceding user prompt
   - a short excerpt of the answer
   - Markdown sections extracted from that answer
5. Click the jump action (`跳到这里`) or a section title to jump

Notes:

- Dots are preview-first and do not scroll immediately
- The TOC is collapsed by default
- Long dot rails and long preview cards scroll independently
- Only assistant Markdown headings are included; wrapper headings are filtered out
- The current in-product TOC labels are shown in Chinese

### 3. Export the current conversation

1. Open a concrete ChatGPT conversation page (`/c/<id>`)
2. Open the extension side panel
3. Click `Export Current Conversation`
4. The browser downloads one `.md` file

### 4. Export selected history items in a ZIP

1. Open the extension side panel
2. Click `Load History Links`
3. Search, paginate, and select the conversations you want
4. Click `Export Selected (ZIP)`
5. The browser downloads one `.zip` containing one `.md` file per conversation

## Repository Layout

- [extension/](./extension): Chrome extension source
- [tests/](./tests): no-build self-tests
- [scripts/](./scripts): release and packaging scripts
- [doc/2026-03-10/](./doc/2026-03-10): active product and implementation docs
- [release-automation.md](./doc/2026-03-10/release-automation.md): release automation guide

## Current Version

- `v0.3.0`

## Release Automation

The project includes an automated release pipeline, but the full workflow is mostly maintainer-facing.

- This README keeps only a short overview
- For the full publishing flow, see [doc/2026-03-10/release-automation.md](./doc/2026-03-10/release-automation.md)

## Debugging (optional, chrome-devtools-mcp)

If you want automated debugging or to run `npm run test:cdp`:

1. Launch a dedicated Chrome instance:
   ```bash
   mkdir -p /tmp/chrome-mcp-chatgpt
   open -na "Google Chrome" --args \
     --remote-debugging-port=9222 \
     --user-data-dir=/tmp/chrome-mcp-chatgpt
   ```
2. Sign in to `https://chatgpt.com` in that window
3. Verify the debugging endpoint:
   ```bash
   curl -s http://127.0.0.1:9222/json/version
   curl -s http://127.0.0.1:9222/json/list
   ```
4. Reconnect MCP:
   ```bash
   codex mcp remove chrome-devtools
   codex mcp add chrome-devtools -- \
     npx -y chrome-devtools-mcp@latest \
     --browser-url=http://127.0.0.1:9222
   codex mcp list
   ```
5. Run:
   ```bash
   npm run test:cdp
   ```

## Contributing

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Load [extension/](./extension) in `chrome://extensions`
4. After changes, run at least:
   - `npm run test:content-dom`
   - `npm run test:toc`
   - `npm run test:folders`
   - `npm run test:markdown`
   - `npm run test:zip`
5. Run `npm run test:cdp` if needed
6. In your PR, explain:
   - what changed
   - why it changed
   - how you verified it
