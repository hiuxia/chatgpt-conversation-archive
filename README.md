[English](./README.md) | [简体中文](./README.zh-CN.md)

# ChatGPT Voyager

Turn ChatGPT into an organized workspace.

`ChatGPT Voyager` is a Chrome extension for `chatgpt.com` that helps you:

- organize chat history with nested folders in the native sidebar
- preview long answers before jumping through a right-side TOC
- export important conversations to Markdown or ZIP

Local-first. No sync to ChatGPT servers. No modification to ChatGPT server-side data.

## Why People Use It

### Organize long-running chat history

ChatGPT's default history works for quick sessions, but it becomes messy once you are juggling research, coding, writing, and repeated follow-up threads. Voyager adds nested folders directly into the existing ChatGPT sidebar, so your history feels more like a workspace than a dump.

### Read long answers faster

Long assistant replies are useful, but hard to scan. Voyager adds a lightweight right-side TOC with preview-first dots, so you can inspect an answer before deciding to jump into it.

### Keep useful work outside ChatGPT

Some conversations are worth keeping. Voyager lets you export the current conversation as Markdown or batch-export selected chats into a ZIP, so your notes are easier to reuse elsewhere.

## Best For

- researchers working through long ChatGPT threads
- developers using ChatGPT for debugging, planning, or code review
- writers collecting reusable outlines and reference conversations
- anyone whose ChatGPT sidebar already feels chaotic

## What You Get

### Sidebar organization

- Add a `Folders` section to ChatGPT's native left sidebar
- Create nested folders inline
- Drag chats into folders, or drag them back to `Your chats`
- Keep folder state resilient with a local conversation cache

### Conversation reading

- Show a collapsible TOC entry on conversation pages
- Preview assistant answers through dots before deciding to jump
- Extract per-answer sections from assistant Markdown headings

### Export

- Export the current conversation to Markdown
- Export selected history items to ZIP

## Install

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the [extension/](./extension) directory from this repository
5. Open `https://chatgpt.com` and sign in
6. Refresh the page and confirm that `Folders` appears in the left sidebar
7. Open the `ChatGPT Voyager` side panel when you want to export conversations

## How It Works

### Organize chats with sidebar folders

1. Find `Folders` in the ChatGPT left sidebar
2. Click `New folder` to create a top-level folder
3. Use the `...` menu to rename, delete, or create a subfolder
4. Drag conversations into folders
5. Drag a folder into another folder to create a nested tree

Notes:

- Folders are local to the extension and do not sync to your ChatGPT account
- Deleting a parent folder does not delete conversations; child folders are promoted one level up
- Previously cached conversations can still appear inside folders even when the native history list has not fully reloaded yet

### Preview long conversations with the right-side TOC

1. Open any ChatGPT conversation page (`/c/<id>`)
2. Click the right-side TOC button (`TOC`)
3. Click a dot to preview the corresponding assistant answer
4. Use the preview card to inspect:
   - the prefix of the preceding user prompt
   - a short excerpt of the answer
   - Markdown sections extracted from that answer
5. Click the jump action (`Jump here`) or a section title to jump

Notes:

- Dots are preview-first and do not scroll immediately
- The TOC is collapsed by default
- Long dot rails and long preview cards scroll independently
- Only assistant Markdown headings are included; wrapper headings are filtered out

### Export conversations

Current conversation:

1. Open a concrete ChatGPT conversation page (`/c/<id>`)
2. Open the extension side panel
3. Click `Export Current Conversation`

Batch export:

1. Open the extension side panel
2. Click `Load History Links`
3. Search, paginate, and select the conversations you want
4. Click `Export Selected (ZIP)`

## Repository Layout

- [extension/](./extension): Chrome extension source
- [tests/](./tests): no-build self-tests
- [scripts/](./scripts): release and packaging scripts

## Current Version

- `v0.3.0`

## Release Automation

The project includes an automated release pipeline, but the detailed flow is maintainer-facing.

- Local release scripts keep versions and changelog entries in sync
- GitHub Actions publishes tagged releases automatically

## Debugging

If you want to run `npm run test:cdp`, start a dedicated Chrome instance with remote debugging enabled and sign in to `chatgpt.com` first. The full MCP-based debugging commands remain in the repository history if you need them for local automation.

## Contributing

1. Fork and clone the repository
2. Install dependencies with `npm install`
3. Load [extension/](./extension) in `chrome://extensions`
4. Run the relevant checks before opening a PR:
   - `npm run test:content-dom`
   - `npm run test:toc`
   - `npm run test:folders`
   - `npm run test:markdown`
   - `npm run test:zip`
5. In your PR, explain what changed, why it changed, and how you verified it
