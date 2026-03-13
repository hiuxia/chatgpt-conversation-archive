# ChatGPT Voyager Extension

Full project docs:

- [English](../README.md)
- [简体中文](../README.zh-CN.md)

## Load Unpacked

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this `extension/` directory
5. Open `https://chatgpt.com` and sign in
6. Refresh the page
7. Confirm that `Folders` appears in the left sidebar

## Quick Check

1. Use the left sidebar to create a folder and drag a chat into it
2. Open a conversation page and confirm the right-side TOC button appears
3. Open the extension side panel when you want to export conversations

## Current Capabilities

1. Inject a `Folders` section into ChatGPT's native left sidebar
2. Support nested folders with inline create / rename / delete / move
3. Keep folder state resilient with a locally cached conversation catalog
4. Add a collapsible right-side TOC with dot previews for long conversations
5. Export the current conversation to Markdown from the side panel
6. Export selected history items to a ZIP archive

## Notes

- Folder organization is a local extension layer and does not modify ChatGPT server data.
- The right-side TOC is preview-first: dots open a preview card before jumping.
- Batch export opens selected conversation pages sequentially in background tabs.
