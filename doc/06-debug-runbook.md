# 06 Debug Runbook

This runbook documents the known-good local debug flow.

## A. Start a Dedicated Chrome Profile

```bash
mkdir -p /tmp/chrome-mcp-chatgpt
open -na "Google Chrome" --args \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-mcp-chatgpt
```

Then log into `https://chatgpt.com` in that dedicated window.

## B. Verify Debug Port

```bash
curl -s http://127.0.0.1:9222/json/version
curl -s http://127.0.0.1:9222/json/list
```

Expected:

- `json/version` includes `webSocketDebuggerUrl`
- `json/list` includes a `chatgpt.com` page target

## C. MCP Binding (If Needed)

```bash
codex mcp remove chrome-devtools
codex mcp add chrome-devtools -- \
  npx -y chrome-devtools-mcp@latest \
  --browser-url=http://127.0.0.1:9222
codex mcp list
```

## D. Known Observations to Re-Check After UI Changes

1. History list selector:
- `nav[aria-label="Chat history"] #history a[href^="/c/"]`
2. Message selector:
- `[data-message-author-role]`
3. Turn selector:
- `article[data-testid^="conversation-turn-"]`
4. Pagination behavior:
- `/backend-api/conversations?offset=<n>&limit=28...`

## E. Common Issues

1. `conversation_not_found` from direct fetch:
- Private API context mismatch can happen.
- Keep DOM-first extraction as default.

2. No chat targets on `json/list`:
- Ensure you launched dedicated Chrome with `--remote-debugging-port=9222`.

3. History count too low:
- Sidebar is lazy-loaded; perform scroll-load before final selection.

