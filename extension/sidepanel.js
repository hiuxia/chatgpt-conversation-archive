const MESSAGE_TYPES = {
  EXPORT_CURRENT_FROM_ACTIVE_TAB: "EXPORT_CURRENT_FROM_ACTIVE_TAB",
  EXPORT_SELECTED_FROM_ACTIVE_TAB: "EXPORT_SELECTED_FROM_ACTIVE_TAB",
  GET_HISTORY_FROM_ACTIVE_TAB: "GET_HISTORY_FROM_ACTIVE_TAB"
};

const STORAGE_KEYS = {
  SELECTED_IDS: "selectedHistoryConversationIds"
};

const exportCurrentBtn = document.getElementById("export-current-btn");
const exportSelectedBtn = document.getElementById("export-selected-btn");
const refreshHistoryBtn = document.getElementById("refresh-history-btn");
const selectVisibleBtn = document.getElementById("select-visible-btn");
const clearSelectionBtn = document.getElementById("clear-selection-btn");
const prevPageBtn = document.getElementById("prev-page-btn");
const nextPageBtn = document.getElementById("next-page-btn");
const pageInfoEl = document.getElementById("page-info");
const pageSizeSelect = document.getElementById("history-page-size");
const searchInput = document.getElementById("history-search-input");
const historyListEl = document.getElementById("history-list");
const historyCountEl = document.getElementById("history-count");
const selectedCountEl = document.getElementById("selected-count");
const statusEl = document.getElementById("status");

const state = {
  historyItems: [],
  selectedIds: new Set(),
  searchQuery: "",
  page: 1,
  pageSize: 20,
  isBusy: false
};

exportCurrentBtn.addEventListener("click", onExportCurrentClick);
exportSelectedBtn.addEventListener("click", onExportSelectedClick);
refreshHistoryBtn.addEventListener("click", onRefreshHistoryClick);
selectVisibleBtn.addEventListener("click", onSelectVisibleClick);
clearSelectionBtn.addEventListener("click", onClearSelectionClick);
prevPageBtn.addEventListener("click", onPrevPageClick);
nextPageBtn.addEventListener("click", onNextPageClick);
pageSizeSelect.addEventListener("change", onPageSizeChange);
searchInput.addEventListener("input", onSearchInput);

init();

async function init() {
  await restoreSelectedIds();
  setStatus("Ready");
  renderHistory();
}

async function onExportCurrentClick() {
  setBusy(true);
  setStatus("Exporting current conversation...");

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.EXPORT_CURRENT_FROM_ACTIVE_TAB
    });

    if (!response?.ok) {
      setStatus(`Export failed: ${response?.error || "Unknown error"}`);
      return;
    }

    setStatus(
      [
        "Export complete.",
        `File: ${response.filename}`,
        `Conversation ID: ${response.conversationId}`,
        `Turns: ${response.turnCount}`
      ].join("\n")
    );
  } catch (error) {
    setStatus(`Export failed: ${error?.message || String(error)}`);
  } finally {
    setBusy(false);
  }
}

async function onRefreshHistoryClick() {
  setBusy(true);
  setStatus("Loading history links from current ChatGPT tab...");

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.GET_HISTORY_FROM_ACTIVE_TAB
    });

    if (!response?.ok) {
      setStatus(`Load failed: ${response?.error || "Unknown error"}`);
      return;
    }

    const previousSelected = new Set(state.selectedIds);
    state.historyItems = response.items || [];
    state.selectedIds = new Set(
      state.historyItems.filter((item) => previousSelected.has(item.id)).map((item) => item.id)
    );
    state.page = 1;
    await persistSelectedIds();
    renderHistory();
    setStatus(`Loaded ${state.historyItems.length} history entries.`);
  } catch (error) {
    setStatus(`Load failed: ${error?.message || String(error)}`);
  } finally {
    setBusy(false);
  }
}

async function onExportSelectedClick() {
  const selectedItems = state.historyItems.filter((item) => state.selectedIds.has(item.id));
  if (!selectedItems.length) {
    setStatus("Please select at least one history item first.");
    return;
  }

  setBusy(true);
  setStatus(`Exporting ${selectedItems.length} selected conversation(s) to ZIP...`);

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.EXPORT_SELECTED_FROM_ACTIVE_TAB,
      items: selectedItems
    });

    if (!response?.ok) {
      const lines = [`Batch export failed: ${response?.error || "Unknown error"}`];
      if (Array.isArray(response?.failures) && response.failures.length) {
        lines.push("");
        lines.push("Failure details:");
        for (const item of response.failures.slice(0, 10)) {
          lines.push(`- ${item.title || item.id}: ${item.error}`);
        }
        if (response.failures.length > 10) {
          lines.push(`- ... and ${response.failures.length - 10} more`);
        }
      }
      setStatus(lines.join("\n"));
      return;
    }

    const lines = [
      "Batch export complete.",
      `ZIP: ${response.filename}`,
      `Total: ${response.total}`,
      `Success: ${response.successCount}`,
      `Failed: ${response.failedCount}`
    ];
    if (response.failedCount > 0) {
      lines.push("");
      lines.push("Failed items:");
      for (const item of response.failures.slice(0, 8)) {
        lines.push(`- ${item.title || item.id}: ${item.error}`);
      }
      if (response.failures.length > 8) {
        lines.push(`- ... and ${response.failures.length - 8} more`);
      }
    }
    setStatus(lines.join("\n"));
  } catch (error) {
    setStatus(`Batch export failed: ${error?.message || String(error)}`);
  } finally {
    setBusy(false);
  }
}

function onSelectVisibleClick() {
  const currentPageItems = getCurrentPageItems();
  for (const item of currentPageItems) {
    state.selectedIds.add(item.id);
  }
  void persistSelectedIds();
  renderHistory();
}

function onClearSelectionClick() {
  state.selectedIds.clear();
  void persistSelectedIds();
  renderHistory();
}

function onSearchInput() {
  state.searchQuery = (searchInput.value || "").trim().toLowerCase();
  state.page = 1;
  renderHistory();
}

function onPrevPageClick() {
  if (state.page <= 1) return;
  state.page -= 1;
  renderHistory();
}

function onNextPageClick() {
  const totalPages = getTotalPages(getFilteredItems().length);
  if (state.page >= totalPages) return;
  state.page += 1;
  renderHistory();
}

function onPageSizeChange() {
  const nextSize = Number(pageSizeSelect.value);
  if (!Number.isFinite(nextSize) || nextSize <= 0) {
    pageSizeSelect.value = String(state.pageSize);
    return;
  }
  state.pageSize = nextSize;
  state.page = 1;
  renderHistory();
}

function renderHistory() {
  historyListEl.innerHTML = "";
  const filteredItems = getFilteredItems();
  const pagination = getPaginationMeta(filteredItems.length);
  const pagedItems = filteredItems.slice(pagination.startIndex, pagination.endIndex);
  const selectedInHistoryCount = getSelectedItemsInHistory().length;
  const rangeText = pagination.totalItems
    ? `${pagination.startIndex + 1}-${pagination.endIndex}`
    : "0";
  historyCountEl.textContent = `${rangeText}/${pagination.totalItems} (all ${state.historyItems.length})`;
  selectedCountEl.textContent = `Selected: ${selectedInHistoryCount}`;
  pageInfoEl.textContent = `Page ${pagination.page}/${pagination.totalPages}`;
  exportSelectedBtn.disabled = state.isBusy || selectedInHistoryCount === 0;
  selectVisibleBtn.disabled = state.isBusy || pagedItems.length === 0;
  clearSelectionBtn.disabled = state.isBusy || selectedInHistoryCount === 0;
  prevPageBtn.disabled = state.isBusy || pagination.page <= 1;
  nextPageBtn.disabled = state.isBusy || pagination.page >= pagination.totalPages;
  pageSizeSelect.disabled = state.isBusy || filteredItems.length === 0;

  if (state.historyItems.length === 0) {
    const empty = document.createElement("p");
    empty.className = "history-item-meta";
    empty.textContent = "No history links found in current loaded sidebar view.";
    historyListEl.appendChild(empty);
    return;
  }

  if (filteredItems.length === 0) {
    const noMatch = document.createElement("p");
    noMatch.className = "history-item-meta";
    noMatch.textContent = "No history items match current search.";
    historyListEl.appendChild(noMatch);
    return;
  }

  for (const item of pagedItems) {
    const card = document.createElement("article");
    card.className = "history-item";

    const top = document.createElement("div");
    top.className = "history-item-top";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "history-checkbox";
    checkbox.checked = state.selectedIds.has(item.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.selectedIds.add(item.id);
      } else {
        state.selectedIds.delete(item.id);
      }
      void persistSelectedIds();
      renderHistory();
    });

    const title = document.createElement("p");
    title.className = "history-item-title";
    title.textContent = item.title || "Untitled";

    top.appendChild(checkbox);
    top.appendChild(title);

    const meta = document.createElement("p");
    meta.className = "history-item-meta";
    meta.textContent = item.id || "unknown-id";

    card.appendChild(top);
    card.appendChild(meta);
    historyListEl.appendChild(card);
  }
}

function setBusy(isBusy) {
  state.isBusy = isBusy;
  exportCurrentBtn.disabled = isBusy;
  refreshHistoryBtn.disabled = isBusy;
  searchInput.disabled = isBusy;
  renderHistory();
}

function setStatus(text) {
  statusEl.textContent = text;
}

function getFilteredItems() {
  if (!state.searchQuery) {
    return state.historyItems;
  }

  return state.historyItems.filter((item) =>
    (item.title || "").toLowerCase().includes(state.searchQuery)
  );
}

function getSelectedItemsInHistory() {
  return state.historyItems.filter((item) => state.selectedIds.has(item.id));
}

function getCurrentPageItems() {
  const filteredItems = getFilteredItems();
  const { startIndex, endIndex } = getPaginationMeta(filteredItems.length);
  return filteredItems.slice(startIndex, endIndex);
}

function getPaginationMeta(totalItems) {
  const totalPages = getTotalPages(totalItems);
  state.page = Math.min(Math.max(1, state.page), totalPages);
  const startIndex = (state.page - 1) * state.pageSize;
  const endIndex = Math.min(startIndex + state.pageSize, totalItems);

  return {
    page: state.page,
    totalPages,
    totalItems,
    startIndex,
    endIndex
  };
}

function getTotalPages(totalItems) {
  if (totalItems <= 0) return 1;
  return Math.max(1, Math.ceil(totalItems / state.pageSize));
}

async function restoreSelectedIds() {
  try {
    if (!chrome?.storage?.session) return;
    const stored = await chrome.storage.session.get(STORAGE_KEYS.SELECTED_IDS);
    const ids = stored?.[STORAGE_KEYS.SELECTED_IDS];
    if (!Array.isArray(ids)) return;
    state.selectedIds = new Set(
      ids.map((id) => String(id || "").trim()).filter((id) => id.length > 0)
    );
  } catch (error) {
    console.warn("Failed to restore selected IDs from session storage:", error);
  }
}

async function persistSelectedIds() {
  try {
    if (!chrome?.storage?.session) return;
    await chrome.storage.session.set({
      [STORAGE_KEYS.SELECTED_IDS]: Array.from(state.selectedIds)
    });
  } catch (error) {
    console.warn("Failed to persist selected IDs to session storage:", error);
  }
}
