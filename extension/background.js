const MESSAGE_TYPES = {
  PING: "PING",
  EXPORT_CURRENT_FROM_ACTIVE_TAB: "EXPORT_CURRENT_FROM_ACTIVE_TAB",
  EXPORT_SELECTED_FROM_ACTIVE_TAB: "EXPORT_SELECTED_FROM_ACTIVE_TAB",
  GET_HISTORY_FROM_ACTIVE_TAB: "GET_HISTORY_FROM_ACTIVE_TAB",
  EXTRACT_CURRENT_CONVERSATION: "EXTRACT_CURRENT_CONVERSATION",
  EXTRACT_HISTORY_LINKS: "EXTRACT_HISTORY_LINKS"
};

const TEXT_ENCODER = new TextEncoder();
const CRC32_TABLE = buildCrc32Table();
const EXTRACTION_RETRY_POLICY = {
  maxAttempts: 3,
  baseDelayMs: 800
};

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

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    try {
      const payload = await extractConversationFromUrl(item.url);
      const markdown = toMarkdown(payload);
      const mdFilename = buildMarkdownFilename(payload).replace(/^ChatGPT\//, "");
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
    files: ["content.js"]
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
