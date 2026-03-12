const MESSAGE_TYPES = {
  PING: "PING",
  EXPORT_CURRENT_FROM_ACTIVE_TAB: "EXPORT_CURRENT_FROM_ACTIVE_TAB",
  EXPORT_SELECTED_FROM_ACTIVE_TAB: "EXPORT_SELECTED_FROM_ACTIVE_TAB",
  GET_HISTORY_FROM_ACTIVE_TAB: "GET_HISTORY_FROM_ACTIVE_TAB",
  EXTRACT_CURRENT_CONVERSATION: "EXTRACT_CURRENT_CONVERSATION",
  EXTRACT_HISTORY_LINKS: "EXTRACT_HISTORY_LINKS",
  GET_SIDEBAR_FOLDER_STATE: "GET_SIDEBAR_FOLDER_STATE",
  UPSERT_SIDEBAR_CONVERSATIONS: "UPSERT_SIDEBAR_CONVERSATIONS",
  CREATE_SIDEBAR_FOLDER: "CREATE_SIDEBAR_FOLDER",
  MOVE_SIDEBAR_FOLDER: "MOVE_SIDEBAR_FOLDER",
  RENAME_SIDEBAR_FOLDER: "RENAME_SIDEBAR_FOLDER",
  DELETE_SIDEBAR_FOLDER: "DELETE_SIDEBAR_FOLDER",
  ASSIGN_SIDEBAR_CONVERSATION: "ASSIGN_SIDEBAR_CONVERSATION",
  CLEAR_SIDEBAR_CONVERSATION: "CLEAR_SIDEBAR_CONVERSATION",
  SET_SIDEBAR_FOLDER_EXPANDED: "SET_SIDEBAR_FOLDER_EXPANDED",
  SET_SIDEBAR_SECTION_EXPANDED: "SET_SIDEBAR_SECTION_EXPANDED"
};

const TEXT_ENCODER = new TextEncoder();
const CRC32_TABLE = buildCrc32Table();
const EXTRACTION_RETRY_POLICY = {
  maxAttempts: 3,
  baseDelayMs: 800
};
const CONTENT_SCRIPT_FILES = [
  "content/runtime.js",
  "content/markdown-serializer.js",
  "content/history-extractor.js",
  "content/conversation-toc.js",
  "content/sidebar-folders.js",
  "content.js"
];
const SIDEBAR_FOLDER_STORAGE_KEY = "sidebarFolders.v1";
const SIDEBAR_FOLDER_SCHEMA_VERSION = 3;
let sidebarFolderMutationQueue = Promise.resolve();

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.warn("Failed to set side panel behavior:", error);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MESSAGE_TYPES.EXPORT_CURRENT_FROM_ACTIVE_TAB) {
    exportCurrentFromActiveTab()
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({ ok: false, error: error?.message || "Export failed" })
      );
    return true;
  }

  if (message?.type === MESSAGE_TYPES.EXPORT_SELECTED_FROM_ACTIVE_TAB) {
    exportSelectedFromActiveTab(message.items)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({ ok: false, error: error?.message || "Batch export failed" })
      );
    return true;
  }

  if (message?.type === MESSAGE_TYPES.GET_HISTORY_FROM_ACTIVE_TAB) {
    getHistoryFromActiveTab()
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({ ok: false, error: error?.message || "History load failed" })
      );
    return true;
  }

  if (message?.type === MESSAGE_TYPES.GET_SIDEBAR_FOLDER_STATE) {
    getSidebarFolderState()
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({ ok: false, error: error?.message || "Could not load folder state." })
      );
    return true;
  }

  if (message?.type === MESSAGE_TYPES.UPSERT_SIDEBAR_CONVERSATIONS) {
    upsertSidebarConversationCatalog(message.items, message.source)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({ ok: false, error: error?.message || "Could not update conversation cache." })
      );
    return true;
  }

  if (message?.type === MESSAGE_TYPES.CREATE_SIDEBAR_FOLDER) {
    createSidebarFolder(message.name, message.parentFolderId)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({ ok: false, error: error?.message || "Could not create folder." })
      );
    return true;
  }

  if (message?.type === MESSAGE_TYPES.MOVE_SIDEBAR_FOLDER) {
    moveSidebarFolder(message.folderId, message.parentFolderId)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({ ok: false, error: error?.message || "Could not move folder." })
      );
    return true;
  }

  if (message?.type === MESSAGE_TYPES.RENAME_SIDEBAR_FOLDER) {
    renameSidebarFolder(message.folderId, message.name)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({ ok: false, error: error?.message || "Could not rename folder." })
      );
    return true;
  }

  if (message?.type === MESSAGE_TYPES.DELETE_SIDEBAR_FOLDER) {
    deleteSidebarFolder(message.folderId)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({ ok: false, error: error?.message || "Could not delete folder." })
      );
    return true;
  }

  if (message?.type === MESSAGE_TYPES.ASSIGN_SIDEBAR_CONVERSATION) {
    assignSidebarConversation(message)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({ ok: false, error: error?.message || "Could not assign conversation." })
      );
    return true;
  }

  if (message?.type === MESSAGE_TYPES.CLEAR_SIDEBAR_CONVERSATION) {
    clearSidebarConversation(message.conversationId)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({ ok: false, error: error?.message || "Could not clear conversation folder." })
      );
    return true;
  }

  if (message?.type === MESSAGE_TYPES.SET_SIDEBAR_FOLDER_EXPANDED) {
    setSidebarFolderExpanded(message.folderId, message.expanded)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({ ok: false, error: error?.message || "Could not update folder state." })
      );
    return true;
  }

  if (message?.type === MESSAGE_TYPES.SET_SIDEBAR_SECTION_EXPANDED) {
    setSidebarSectionExpanded(message.expanded)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({ ok: false, error: error?.message || "Could not update section state." })
      );
    return true;
  }

  return false;
});

async function exportCurrentFromActiveTab() {
  const tab = await getActiveChatGptTab();
  const expectedPath = parseConversationId(tab.url || "")
    ? `/c/${parseConversationId(tab.url || "")}`
    : "";
  const response = await sendMessageToContentWithRecovery(tab.id, {
    type: MESSAGE_TYPES.EXTRACT_CURRENT_CONVERSATION
  }, {
    expectedPath
  });

  if (!response?.ok) {
    return {
      ok: false,
      error: response?.error || "Could not extract conversation from current tab."
    };
  }

  const payload = response.data;
  await upsertSidebarConversationCatalog(
    [
      {
        id: payload.id,
        title: payload.title,
        url: payload.sourceUrl
      }
    ],
    "current"
  );
  const markdown = toMarkdown(payload);
  const filename = buildMarkdownFilename(payload);
  await downloadTextFile(markdown, filename);

  return {
    ok: true,
    filename,
    turnCount: payload.turns.length,
    conversationId: payload.id
  };
}

async function exportSelectedFromActiveTab(rawItems) {
  const items = normalizeSelectedItems(rawItems);
  if (!items.length) {
    return {
      ok: false,
      error: "No selected history items were provided."
    };
  }

  const files = [];
  const failures = [];
  const extractedCatalogItems = [];

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    try {
      const payload = await extractConversationFromUrl(item.url);
      const markdown = toMarkdown(payload);
      const mdFilename = buildMarkdownFilename(payload).replace(/^ChatGPT\//, "");
      extractedCatalogItems.push({
        id: payload.id,
        title: payload.title,
        url: payload.sourceUrl
      });
      files.push({
        name: mdFilename,
        data: TEXT_ENCODER.encode(markdown)
      });
    } catch (error) {
      failures.push({
        id: item.id,
        title: item.title,
        error: error?.message || "Unknown extraction error"
      });
    }
  }

  if (!files.length) {
    return {
      ok: false,
      error: "All selected conversations failed to export.",
      total: items.length,
      successCount: 0,
      failedCount: failures.length,
      failures
    };
  }

  if (extractedCatalogItems.length > 0) {
    await upsertSidebarConversationCatalog(extractedCatalogItems, "current");
  }

  const zipFilename = buildZipFilename(files.length);
  const zipBytes = createZipArchive(files);
  await downloadBinaryFile(zipBytes, zipFilename, "application/zip");

  return {
    ok: true,
    filename: zipFilename,
    total: items.length,
    successCount: files.length,
    failedCount: failures.length,
    failures
  };
}

async function getHistoryFromActiveTab() {
  const tab = await getActiveChatGptTab();
  const response = await sendMessageToContentWithRecovery(tab.id, {
    type: MESSAGE_TYPES.EXTRACT_HISTORY_LINKS
  });

  if (!response?.ok) {
    return {
      ok: false,
      error: response?.error || "Could not load history links."
    };
  }

  if (Array.isArray(response.items) && response.items.length > 0) {
    await upsertSidebarConversationCatalog(response.items, "history");
  }

  return {
    ok: true,
    items: response.items || []
  };
}

async function getActiveChatGptTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  const tab = tabs.find((item) => item.url && item.url.startsWith("https://chatgpt.com/"));

  if (!tab?.id) {
    throw new Error("No active chatgpt.com tab found.");
  }
  return tab;
}

function normalizeSelectedItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];

  const deduped = [];
  const seen = new Set();

  for (const rawItem of rawItems) {
    const rawId = String(rawItem?.id || "").trim();
    let rawUrl = String(rawItem?.url || "").trim();

    if (!rawUrl && rawId) {
      rawUrl = `https://chatgpt.com/c/${rawId}`;
    }

    if (!rawUrl || !/^https:\/\/chatgpt\.com\/c\//.test(rawUrl)) {
      continue;
    }

    const parsed = parseConversationId(rawUrl);
    const id = parsed || rawId || rawUrl;
    if (seen.has(id)) continue;
    seen.add(id);

    deduped.push({
      id,
      title: (rawItem?.title || "Untitled").trim(),
      url: rawUrl
    });
  }

  return deduped;
}

function parseConversationId(url) {
  const match = String(url).match(/\/c\/([0-9a-f-]+)/i);
  return match ? match[1] : "";
}

async function extractConversationFromUrl(url) {
  let tab;
  try {
    const conversationId = parseConversationId(url);
    if (!conversationId) {
      throw new Error(`Invalid conversation url: ${url}`);
    }

    tab = await chrome.tabs.create({
      url,
      active: false
    });

    return await extractConversationFromTabWithRetry(tab.id, conversationId);
  } finally {
    if (tab?.id) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch (_) {
        // ignore tab close errors
      }
    }
  }
}

async function extractConversationFromTabWithRetry(tabId, conversationId) {
  let lastError;

  for (let attempt = 1; attempt <= EXTRACTION_RETRY_POLICY.maxAttempts; attempt += 1) {
    try {
      const response = await sendMessageToContentWithRecovery(
        tabId,
        {
          type: MESSAGE_TYPES.EXTRACT_CURRENT_CONVERSATION
        },
        {
          expectedPath: `/c/${conversationId}`
        }
      );

      if (!response?.ok || !response?.data) {
        throw new Error(response?.error || "Failed to extract conversation from opened tab.");
      }

      return response.data;
    } catch (error) {
      lastError = error;
      if (!shouldRetryExtractionError(error) || attempt >= EXTRACTION_RETRY_POLICY.maxAttempts) {
        break;
      }

      await safeReloadTab(tabId);
      await sleep(getBackoffDelayMs(attempt));
    }
  }

  throw enrichExtractionError(lastError, conversationId, EXTRACTION_RETRY_POLICY.maxAttempts);
}

async function sendMessageToContentWithRecovery(tabId, payload, options = {}) {
  const { expectedPath = "" } = options;
  await waitForTabReady(tabId, {
    timeoutMs: 12_000,
    expectedPath
  });

  try {
    await pingContentScript(tabId);
  } catch (error) {
    if (!isConnectionError(error)) {
      throw error;
    }

    await reinjectContentScript(tabId);
    await waitForTabReady(tabId, {
      timeoutMs: 8_000,
      expectedPath
    });
    await pingContentScript(tabId);
  }

  try {
    return await chrome.tabs.sendMessage(tabId, payload);
  } catch (error) {
    if (!isConnectionError(error)) {
      throw error;
    }

    await reinjectContentScript(tabId);
    await waitForTabReady(tabId, {
      timeoutMs: 8_000,
      expectedPath
    });
    await pingContentScript(tabId);
    return chrome.tabs.sendMessage(tabId, payload);
  }
}

async function pingContentScript(tabId) {
  const response = await chrome.tabs.sendMessage(tabId, {
    type: MESSAGE_TYPES.PING
  });
  if (!response?.ok || !response?.pong) {
    throw new Error("Content script ping failed.");
  }
}

function isConnectionError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("receiving end does not exist") ||
    message.includes("message port closed") ||
    message.includes("could not establish connection")
  );
}

function shouldRetryExtractionError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  if (!message) return false;

  const nonRetryablePatterns = [
    "invalid conversation url",
    "not a conversation route",
    "no active chatgpt.com tab found"
  ];
  if (nonRetryablePatterns.some((pattern) => message.includes(pattern))) {
    return false;
  }

  const retryablePatterns = [
    "no conversation messages found on the page",
    "timed out waiting for tab",
    "execution context was destroyed",
    "frame was detached",
    "tab was closed",
    "cannot access contents",
    "navigation",
    "network",
    "timeout"
  ];
  if (retryablePatterns.some((pattern) => message.includes(pattern))) {
    return true;
  }

  return true;
}

function enrichExtractionError(error, conversationId, attempts) {
  const baseMessage = String(error?.message || error || "Unknown extraction error");
  return new Error(
    [
      `Extraction failed after ${attempts} attempts.`,
      `conversationId=${conversationId || "unknown"}`,
      baseMessage
    ].join(" ")
  );
}

async function safeReloadTab(tabId) {
  try {
    await chrome.tabs.reload(tabId);
  } catch (_) {
    // ignore reload failures and let next attempt proceed
  }
}

function getBackoffDelayMs(attempt) {
  const base = EXTRACTION_RETRY_POLICY.baseDelayMs * Math.pow(2, Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(3_500, base + jitter);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reinjectContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: CONTENT_SCRIPT_FILES
  });
}

async function waitForTabReady(tabId, options) {
  const { timeoutMs = 12_000, expectedPath = "" } = options || {};
  const initialTab = await chrome.tabs.get(tabId);
  if (isTabReadyForMessaging(initialTab, expectedPath)) {
    return;
  }

  await new Promise((resolve, reject) => {
    let lastUrl = initialTab?.url || "";
    let lastStatus = initialTab?.status || "unknown";

    const interval = setInterval(async () => {
      try {
        const current = await chrome.tabs.get(tabId);
        lastUrl = current?.url || lastUrl;
        lastStatus = current?.status || lastStatus;
        if (isTabReadyForMessaging(current, expectedPath)) {
          cleanup();
          resolve();
        }
      } catch (error) {
        cleanup();
        reject(error);
      }
    }, 500);

    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `Timed out waiting for tab ${tabId} to be ready. status=${lastStatus}, url=${lastUrl || "unknown"}`
        )
      );
    }, timeoutMs);

    const onUpdated = (updatedTabId, changeInfo, updatedTab) => {
      if (updatedTabId !== tabId) return;
      lastUrl = updatedTab?.url || lastUrl;
      lastStatus = updatedTab?.status || lastStatus;
      if (isTabReadyForMessaging(updatedTab, expectedPath)) {
        cleanup();
        resolve();
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(interval);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };

    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

function isTabReadyForMessaging(tab, expectedPath) {
  if (!tab) return false;
  if (tab.discarded) return false;
  if (tab.status !== "complete") return false;
  const url = String(tab.url || "");
  if (!url.startsWith("https://chatgpt.com/")) return false;
  if (expectedPath && !url.includes(expectedPath)) return false;
  return true;
}

async function downloadTextFile(text, filename) {
  const url = `data:text/markdown;charset=utf-8,${encodeURIComponent(text)}`;
  await chrome.downloads.download({
    url,
    filename,
    conflictAction: "uniquify",
    saveAs: true
  });
}

async function downloadBinaryFile(bytes, filename, mimeType) {
  const dataUrl = bytesToDataUrl(bytes, mimeType);
  await chrome.downloads.download({
    url: dataUrl,
    filename,
    conflictAction: "uniquify",
    saveAs: true
  });
}

function bytesToDataUrl(bytes, mimeType) {
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function toMarkdown(payload) {
  const lines = [];
  lines.push(`# ${payload.title || "Untitled Conversation"}`);
  lines.push("");
  lines.push(`- Conversation ID: \`${payload.id || "unknown"}\``);
  lines.push(`- Source: ${payload.sourceUrl || "unknown"}`);
  lines.push(`- Exported At: ${payload.exportedAt}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const turn of payload.turns) {
    const heading = turn.role === "assistant" ? "Assistant" : "User";
    lines.push(`## ${heading}`);
    lines.push("");
    lines.push(turn.markdown || turn.text || "");
    lines.push("");

    if (turn.attachments?.length) {
      lines.push("Attachments:");
      for (const item of turn.attachments) {
        lines.push(`- ${item.alt || "image"}: ${item.src}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n").trim() + "\n";
}

function buildMarkdownFilename(payload) {
  const date = new Date().toISOString().slice(0, 10);
  const safeTitle = sanitizeFilename(payload.title || "untitled");
  const safeId = sanitizeFilename(payload.id || "unknown");
  return `ChatGPT/${date}_${safeTitle}_${safeId}.md`;
}

function buildZipFilename(fileCount) {
  const date = new Date().toISOString().slice(0, 10);
  return `ChatGPT/${date}_batch_export_${fileCount}.zip`;
}

function sanitizeFilename(value) {
  return value
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

async function getSidebarFolderState() {
  const state = await readSidebarFolderState();
  return {
    ok: true,
    state: cloneForMessage(state)
  };
}

async function createSidebarFolder(name, parentFolderId = null) {
  const normalizedName = normalizeFolderName(name);
  const normalizedParentId = normalizeParentFolderId(parentFolderId);
  if (!normalizedName) {
    return {
      ok: false,
      error: "Folder name is required."
    };
  }

  const state = await mutateSidebarFolderState((draft) => {
    const timestamp = new Date().toISOString();
    if (normalizedParentId && !draft.folders.some((folder) => folder.id === normalizedParentId)) {
      throw new Error("Parent folder not found.");
    }
    const nextOrder = getNextSiblingOrder(draft.folders, normalizedParentId);

    draft.folders.push({
      id: createSidebarFolderId(),
      name: normalizedName,
      parentFolderId: normalizedParentId,
      order: nextOrder,
      expanded: true,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  });

  return { ok: true, state };
}

async function renameSidebarFolder(folderId, name) {
  const normalizedName = normalizeFolderName(name);
  if (!folderId) {
    return { ok: false, error: "Folder id is required." };
  }
  if (!normalizedName) {
    return { ok: false, error: "Folder name is required." };
  }

  const state = await mutateSidebarFolderState((draft) => {
    const folder = draft.folders.find((item) => item.id === folderId);
    if (!folder) {
      throw new Error("Folder not found.");
    }
    folder.name = normalizedName;
    folder.updatedAt = new Date().toISOString();
  });

  return { ok: true, state };
}

async function moveSidebarFolder(folderId, parentFolderId) {
  const normalizedId = String(folderId || "").trim();
  const normalizedParentId = normalizeParentFolderId(parentFolderId);
  if (!normalizedId) {
    return { ok: false, error: "Folder id is required." };
  }

  try {
    const state = await mutateSidebarFolderState((draft) => {
      const folder = draft.folders.find((item) => item.id === normalizedId);
      if (!folder) {
        throw new Error("Folder not found.");
      }
      if (normalizedParentId === normalizedId) {
        throw new Error("A folder cannot be moved into itself.");
      }
      if (normalizedParentId && !draft.folders.some((item) => item.id === normalizedParentId)) {
        throw new Error("Parent folder not found.");
      }
      if (
        normalizedParentId &&
        wouldCreateFolderCycle(draft.folders, normalizedId, normalizedParentId)
      ) {
        throw new Error("A folder cannot be moved into its descendant.");
      }

      folder.parentFolderId = normalizedParentId;
      folder.order = getNextSiblingOrder(
        draft.folders.filter((item) => item.id !== normalizedId),
        normalizedParentId
      );
      folder.updatedAt = new Date().toISOString();
    });

    return { ok: true, state };
  } catch (error) {
    return { ok: false, error: error?.message || "Could not move folder." };
  }
}

async function deleteSidebarFolder(folderId) {
  if (!folderId) {
    return { ok: false, error: "Folder id is required." };
  }

  const state = await mutateSidebarFolderState((draft) => {
    const deletedFolder = draft.folders.find((item) => item.id === folderId);
    if (!deletedFolder) {
      throw new Error("Folder not found.");
    }

    const nextFolders = draft.folders.filter((item) => item.id !== folderId);
    if (nextFolders.length === draft.folders.length) {
      throw new Error("Folder not found.");
    }

    draft.folders = nextFolders.map((item) =>
      item.parentFolderId === folderId
        ? {
            ...item,
            parentFolderId: deletedFolder.parentFolderId,
            order: getNextSiblingOrder(nextFolders.filter((folder) => folder.id !== item.id), deletedFolder.parentFolderId),
            updatedAt: new Date().toISOString()
          }
        : item
    );
    for (const [conversationId, assignment] of Object.entries(draft.assignments)) {
      if (assignment?.folderId === folderId) {
        delete draft.assignments[conversationId];
      }
    }
  });

  return { ok: true, state };
}

async function assignSidebarConversation(payload) {
  const conversationId = String(payload?.conversationId || "").trim();
  const folderId = String(payload?.folderId || "").trim();
  const title = normalizeSidebarConversationText(payload?.title);
  const url = normalizeSidebarConversationUrl(payload?.url, conversationId);

  if (!conversationId) {
    return { ok: false, error: "Conversation id is required." };
  }
  if (!folderId) {
    return { ok: false, error: "Folder id is required." };
  }

  const state = await mutateSidebarFolderState((draft) => {
    const folder = draft.folders.find((item) => item.id === folderId);
    if (!folder) {
      throw new Error("Folder not found.");
    }

    draft.assignments[conversationId] = {
      folderId,
      title,
      url,
      updatedAt: new Date().toISOString()
    };
    upsertConversationCatalogEntries(
      draft,
      [
        {
          id: conversationId,
          title,
          url
        }
      ],
      "assignment"
    );
  });

  return { ok: true, state };
}

async function clearSidebarConversation(conversationId) {
  const normalizedId = String(conversationId || "").trim();
  if (!normalizedId) {
    return { ok: false, error: "Conversation id is required." };
  }

  const state = await mutateSidebarFolderState((draft) => {
    delete draft.assignments[normalizedId];
  });

  return { ok: true, state };
}

async function setSidebarFolderExpanded(folderId, expanded) {
  const normalizedId = String(folderId || "").trim();
  if (!normalizedId) {
    return { ok: false, error: "Folder id is required." };
  }

  const state = await mutateSidebarFolderState((draft) => {
    const folder = draft.folders.find((item) => item.id === normalizedId);
    if (!folder) {
      throw new Error("Folder not found.");
    }
    folder.expanded = expanded !== false;
    folder.updatedAt = new Date().toISOString();
  });

  return { ok: true, state };
}

async function setSidebarSectionExpanded(expanded) {
  const state = await mutateSidebarFolderState((draft) => {
    draft.ui.sectionExpanded = expanded !== false;
  });

  return { ok: true, state };
}

async function upsertSidebarConversationCatalog(items, source = "history") {
  const normalizedItems = normalizeConversationCatalogInput(items);
  if (!normalizedItems.length) {
    return { ok: true, state: await readSidebarFolderState() };
  }

  const state = await mutateSidebarFolderState((draft) => {
    upsertConversationCatalogEntries(draft, normalizedItems, source);
  });

  return { ok: true, state };
}

async function mutateSidebarFolderState(mutator) {
  return enqueueSidebarFolderMutation(async () => {
    const current = await readSidebarFolderState();
    const draft = cloneSidebarFolderState(current);
    mutator(draft);
    const normalized = normalizeSidebarFolderState(draft);
    await chrome.storage.local.set({
      [SIDEBAR_FOLDER_STORAGE_KEY]: normalized
    });
    return cloneForMessage(normalized);
  });
}

function enqueueSidebarFolderMutation(task) {
  const run = sidebarFolderMutationQueue.then(task, task);
  sidebarFolderMutationQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function readSidebarFolderState() {
  const stored = await chrome.storage.local.get(SIDEBAR_FOLDER_STORAGE_KEY);
  return normalizeSidebarFolderState(stored?.[SIDEBAR_FOLDER_STORAGE_KEY]);
}

function normalizeSidebarFolderState(rawState) {
  const rawFolders = Array.isArray(rawState?.folders) ? rawState.folders : [];
  const rawAssignments =
    rawState?.assignments && typeof rawState.assignments === "object" ? rawState.assignments : {};
  const rawConversationCatalog =
    rawState?.conversationCatalog && typeof rawState.conversationCatalog === "object"
      ? rawState.conversationCatalog
      : {};
  const rawUi = rawState?.ui && typeof rawState.ui === "object" ? rawState.ui : {};

  const folders = rawFolders
    .map((folder, index) => normalizeSidebarFolder(folder, index))
    .filter(Boolean)
    .sort((left, right) => {
      const parentDelta = compareParentFolderIds(left.parentFolderId, right.parentFolderId);
      if (parentDelta !== 0) return parentDelta;
      const orderDelta = left.order - right.order;
      if (orderDelta !== 0) return orderDelta;
      return left.name.localeCompare(right.name);
    })
    .map((folder, _index, list) => ({
      ...folder,
      parentFolderId: resolveNormalizedParentFolderId(list, folder)
    }));

  const knownFolderIds = new Set(folders.map((folder) => folder.id));
  const assignments = {};
  for (const [conversationId, assignment] of Object.entries(rawAssignments)) {
    const normalizedId = String(conversationId || "").trim();
    if (!normalizedId) continue;
    if (!assignment || typeof assignment !== "object") continue;
    if (!knownFolderIds.has(String(assignment.folderId || "").trim())) continue;

    assignments[normalizedId] = {
      folderId: String(assignment.folderId).trim(),
      title: normalizeSidebarConversationText(assignment.title),
      url: normalizeSidebarConversationUrl(assignment.url, normalizedId),
      updatedAt: normalizeIsoTimestamp(assignment.updatedAt)
    };
  }

  const conversationCatalog = {};
  for (const [conversationId, entry] of Object.entries(rawConversationCatalog)) {
    const normalizedEntry = normalizeConversationCatalogEntry(entry, conversationId);
    if (!normalizedEntry) continue;
    conversationCatalog[normalizedEntry.id] = normalizedEntry;
  }

  for (const [conversationId, assignment] of Object.entries(assignments)) {
    const fallbackEntry = normalizeConversationCatalogEntry(
      {
        id: conversationId,
        title: assignment.title,
        url: assignment.url,
        lastSeenAt: assignment.updatedAt,
        lastSeenSource: "assignment"
      },
      conversationId
    );
    if (!fallbackEntry) continue;
    conversationCatalog[conversationId] = mergeConversationCatalogEntry(
      fallbackEntry,
      conversationCatalog[conversationId]
    );
  }

  return {
    schemaVersion: SIDEBAR_FOLDER_SCHEMA_VERSION,
    folders,
    assignments,
    conversationCatalog,
    ui: {
      sectionExpanded: rawUi.sectionExpanded !== false
    }
  };
}

function normalizeSidebarFolder(rawFolder, index) {
  if (!rawFolder || typeof rawFolder !== "object") return null;

  const id = String(rawFolder.id || "").trim();
  const name = normalizeFolderName(rawFolder.name);
  if (!id || !name) return null;

  return {
    id,
    name,
    parentFolderId: normalizeParentFolderId(rawFolder.parentFolderId),
    order: Number.isFinite(Number(rawFolder.order)) ? Number(rawFolder.order) : index,
    expanded: rawFolder.expanded !== false,
    createdAt: normalizeIsoTimestamp(rawFolder.createdAt),
    updatedAt: normalizeIsoTimestamp(rawFolder.updatedAt)
  };
}

function normalizeFolderName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 60);
}

function normalizeParentFolderId(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function resolveNormalizedParentFolderId(folders, folder) {
  const immediateParentId = normalizeParentFolderId(folder?.parentFolderId);
  if (!immediateParentId) {
    return null;
  }

  const folderById = new Map(folders.map((item) => [item.id, item]));
  if (!folderById.has(immediateParentId)) {
    return null;
  }

  const seen = new Set([folder.id]);
  let cursorId = immediateParentId;
  while (cursorId) {
    if (seen.has(cursorId)) {
      return null;
    }
    seen.add(cursorId);
    const currentFolder = folderById.get(cursorId);
    cursorId = normalizeParentFolderId(currentFolder?.parentFolderId);
  }

  return immediateParentId;
}

function normalizeSidebarConversationText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 200);
}

function normalizeConversationCatalogInput(items) {
  if (!Array.isArray(items)) return [];

  const deduped = [];
  const seen = new Set();
  for (const item of items) {
    const normalizedItem = normalizeConversationCatalogEntry(item, item?.id);
    if (!normalizedItem) continue;
    if (seen.has(normalizedItem.id)) continue;
    seen.add(normalizedItem.id);
    deduped.push(normalizedItem);
  }
  return deduped;
}

function normalizeConversationCatalogEntry(rawEntry, fallbackConversationId) {
  if (!rawEntry || typeof rawEntry !== "object") return null;

  const id = String(rawEntry.id || fallbackConversationId || "").trim();
  const title = normalizeSidebarConversationText(rawEntry.title);
  const url = normalizeSidebarConversationUrl(rawEntry.url, id);
  if (!id || !url) return null;

  return {
    id,
    title: title || "Untitled",
    url,
    lastSeenAt: normalizeIsoTimestamp(rawEntry.lastSeenAt || rawEntry.updatedAt),
    lastSeenSource: normalizeConversationCatalogSource(rawEntry.lastSeenSource)
  };
}

function normalizeConversationCatalogSource(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || "history";
}

function normalizeSidebarConversationUrl(value, conversationId) {
  const rawValue = String(value || "").trim();
  if (rawValue.startsWith("https://chatgpt.com/c/")) {
    return rawValue;
  }
  const id = String(conversationId || "").trim();
  return id ? `https://chatgpt.com/c/${id}` : "";
}

function normalizeIsoTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function cloneSidebarFolderState(state) {
  return {
    schemaVersion: state.schemaVersion,
    folders: state.folders.map((folder) => ({ ...folder })),
    assignments: Object.fromEntries(
      Object.entries(state.assignments).map(([key, value]) => [key, { ...value }])
    ),
    conversationCatalog: Object.fromEntries(
      Object.entries(state.conversationCatalog || {}).map(([key, value]) => [key, { ...value }])
    ),
    ui: {
      sectionExpanded: state.ui.sectionExpanded !== false
    }
  };
}

function mergeConversationCatalogEntry(baseEntry, existingEntry) {
  if (!existingEntry) {
    return { ...baseEntry };
  }

  const existingSeenAt = new Date(existingEntry.lastSeenAt || 0).getTime();
  const baseSeenAt = new Date(baseEntry.lastSeenAt || 0).getTime();
  const preferBase = baseSeenAt >= existingSeenAt;
  const preferredTitle = preferBase
    ? normalizeSidebarConversationText(baseEntry.title) || normalizeSidebarConversationText(existingEntry.title)
    : normalizeSidebarConversationText(existingEntry.title) || normalizeSidebarConversationText(baseEntry.title);
  const preferredUrl = preferBase
    ? normalizeSidebarConversationUrl(baseEntry.url, baseEntry.id || existingEntry.id)
    : normalizeSidebarConversationUrl(existingEntry.url, existingEntry.id || baseEntry.id);

  return {
    id: existingEntry.id || baseEntry.id,
    title: preferredTitle || baseEntry.title,
    url: preferredUrl || baseEntry.url,
    lastSeenAt:
      existingSeenAt >= baseSeenAt
        ? normalizeIsoTimestamp(existingEntry.lastSeenAt)
        : normalizeIsoTimestamp(baseEntry.lastSeenAt),
    lastSeenSource:
      existingSeenAt >= baseSeenAt
        ? normalizeConversationCatalogSource(existingEntry.lastSeenSource)
        : normalizeConversationCatalogSource(baseEntry.lastSeenSource)
  };
}

function upsertConversationCatalogEntries(draft, items, source = "history") {
  if (!draft.conversationCatalog || typeof draft.conversationCatalog !== "object") {
    draft.conversationCatalog = {};
  }

  for (const item of normalizeConversationCatalogInput(items)) {
    const nextEntry = {
      ...item,
      lastSeenSource: normalizeConversationCatalogSource(source || item.lastSeenSource),
      lastSeenAt: normalizeIsoTimestamp(item.lastSeenAt)
    };
    draft.conversationCatalog[item.id] = mergeConversationCatalogEntry(
      nextEntry,
      draft.conversationCatalog[item.id]
    );
  }
}

function cloneForMessage(value) {
  return JSON.parse(JSON.stringify(value));
}

function createSidebarFolderId() {
  const random = Math.random().toString(36).slice(2, 10);
  return `fld_${Date.now().toString(36)}_${random}`;
}

function getNextSiblingOrder(folders, parentFolderId) {
  const normalizedParentId = normalizeParentFolderId(parentFolderId);
  return (
    folders
      .filter((folder) => normalizeParentFolderId(folder.parentFolderId) === normalizedParentId)
      .reduce((max, folder) => Math.max(max, Number(folder.order) || 0), -1) + 1
  );
}

function wouldCreateFolderCycle(folders, folderId, nextParentFolderId) {
  let currentId = normalizeParentFolderId(nextParentFolderId);
  const seen = new Set();

  while (currentId) {
    if (currentId === folderId) {
      return true;
    }
    if (seen.has(currentId)) {
      return true;
    }
    seen.add(currentId);
    const currentFolder = folders.find((folder) => folder.id === currentId);
    currentId = normalizeParentFolderId(currentFolder?.parentFolderId);
  }

  return false;
}

function compareParentFolderIds(left, right) {
  const leftId = normalizeParentFolderId(left) || "";
  const rightId = normalizeParentFolderId(right) || "";
  return leftId.localeCompare(rightId);
}

function createZipArchive(files) {
  const dateInfo = getDosDateTime(new Date());
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const file of files) {
    const nameBytes = TEXT_ENCODER.encode(file.name);
    const dataBytes = file.data;
    const crc = crc32(dataBytes);

    const localHeader = createLocalFileHeader({
      nameBytes,
      crc,
      size: dataBytes.length,
      dosTime: dateInfo.time,
      dosDate: dateInfo.date
    });

    localParts.push(localHeader, dataBytes);

    const centralHeader = createCentralDirectoryHeader({
      nameBytes,
      crc,
      size: dataBytes.length,
      dosTime: dateInfo.time,
      dosDate: dateInfo.date,
      localOffset
    });

    centralParts.push(centralHeader);
    localOffset += localHeader.length + dataBytes.length;
  }

  const centralDirectory = concatUint8Arrays(centralParts);
  const endRecord = createEndOfCentralDirectoryRecord({
    entryCount: files.length,
    centralDirectorySize: centralDirectory.length,
    centralDirectoryOffset: localOffset
  });

  return concatUint8Arrays([...localParts, centralDirectory, endRecord]);
}

function createLocalFileHeader({ nameBytes, crc, size, dosTime, dosDate }) {
  const header = new Uint8Array(30 + nameBytes.length);
  const view = new DataView(header.buffer);

  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, dosTime, true);
  view.setUint16(12, dosDate, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, nameBytes.length, true);
  view.setUint16(28, 0, true);
  header.set(nameBytes, 30);

  return header;
}

function createCentralDirectoryHeader({ nameBytes, crc, size, dosTime, dosDate, localOffset }) {
  const header = new Uint8Array(46 + nameBytes.length);
  const view = new DataView(header.buffer);

  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, dosTime, true);
  view.setUint16(14, dosDate, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, nameBytes.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, localOffset, true);
  header.set(nameBytes, 46);

  return header;
}

function createEndOfCentralDirectoryRecord({
  entryCount,
  centralDirectorySize,
  centralDirectoryOffset
}) {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);

  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);

  return record;
}

function concatUint8Arrays(parts) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(totalLength);

  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }

  return out;
}

function getDosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  return { date: dosDate, time: dosTime };
}

function buildCrc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    const idx = (crc ^ bytes[i]) & 0xff;
    crc = CRC32_TABLE[idx] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
