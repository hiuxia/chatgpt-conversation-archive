# Development Setup

Last updated: `2026-02-22`

## Project Name

- Product name: `ChatGPT Conversation Archive`
- Folder name: `chatgpt-conversation-archive`

## Scope

- Target site: `https://chatgpt.com/*`
- Main capabilities:
  - Export current conversation to `.md`
  - Select multiple history conversations and export as `.zip`

## Current Tech Stack (Implemented)

1. Chrome Extension Manifest V3
2. Plain JavaScript (no build step)
3. In-worker ZIP generation (no external ZIP runtime dependency)
4. Puppeteer-based CDP smoke test (`puppeteer-core`)

## Current Repo Layout

```text
chatgpt-conversation-archive/
  AGENTS.md
  README.md
  doc/
  extension/
    manifest.json
    background.js
    content.js
    sidepanel.html
    sidepanel.css
    sidepanel.js
  tests/
  package.json
```

## Manifest Baseline (Current)

```json
{
  "manifest_version": 3,
  "permissions": ["storage", "downloads", "tabs", "sidePanel", "scripting"],
  "host_permissions": ["https://chatgpt.com/*"]
}
```

## Available Commands

```bash
cd chatgpt-conversation-archive
npm install
npm run test:cdp
npm run test:zip
```

## Local Debug Flow

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked` and select `chatgpt-conversation-archive/extension`
4. Pin extension, open `https://chatgpt.com`, and open side panel
5. Validate:
   - `Export Current Conversation`
   - `Load History Links`
   - `Export Selected (ZIP)`

## Optional Future Migration (Not Implemented Yet)

1. TypeScript migration
2. Build tooling (`Vite`/`esbuild`)
3. Shared module extraction for serialization/types
