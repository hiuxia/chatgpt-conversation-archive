# ChatGPT Voyager Extension

Full project docs:

- [简体中文](../README.md)
- [English](../README.en.md)

## Load Unpacked

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this `extension/` directory

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
