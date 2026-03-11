# Extension Quick Start

## Load Unpacked

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this `extension/` folder

## Current Capabilities

1. Inject a `Folders` section into the ChatGPT left sidebar
2. Create, rename, delete, expand, and collapse first-level folders inline
3. Drag chats into folders or back to `Your chats`
4. Persist folder state locally in `chrome.storage.local`
5. Export the current conversation to Markdown from the side panel
6. Read loaded history links from the sidebar DOM and export selected chats to one ZIP

## Notes

- Folder organization is a local extension layer and does not modify ChatGPT server data.
- Batch export currently opens selected conversation pages sequentially in background tabs.
