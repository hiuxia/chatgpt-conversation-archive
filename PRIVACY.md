# Privacy Policy

Last updated: 2026-02-22

## Summary

`ChatGPT Conversation Archive` processes conversation content locally in your browser to export Markdown and ZIP files.

## Data Handling

1. The extension reads page DOM content from `https://chatgpt.com/*` when you trigger export actions.
2. Exported files are generated locally and downloaded via Chrome Downloads API.
3. The extension does not send conversation content to external servers.
4. Selection state may be stored in `chrome.storage.session` for in-session UX continuity.

## Permissions

1. `storage`: store session-level UI state (selected items).
2. `downloads`: download `.md` and `.zip` exports.
3. `tabs`: access active tab and open background tabs for batch export.
4. `sidePanel`: provide side panel UI.
5. `scripting`: reinject content script for connection recovery.
6. Host permission `https://chatgpt.com/*`: required for extraction on target site.

## Contact

Please open a GitHub issue for privacy questions.

