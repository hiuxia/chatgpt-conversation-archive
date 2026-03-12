(function () {
  const ns = (globalThis.__chatgptConversationArchiveContent =
    globalThis.__chatgptConversationArchiveContent || {});

  if (ns.runtimeLoaded) {
    return;
  }
  ns.runtimeLoaded = true;

  ns.MESSAGE_TYPES = {
    PING: "PING",
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

  ns.SELECTOR_MAP = {
    historyContainers: [
      'nav[aria-label="Chat history"] #history',
      "#history",
      'nav[aria-label="Chat history"]'
    ],
    sidebarNav: ['nav[aria-label="Chat history"]'],
    historyAnchors: ['a[href^="/c/"]', 'a[href*="/c/"]'],
    conversationMain: ["main"],
    turnArticles: ['article[data-testid^="conversation-turn-"]'],
    roleNodes: ["[data-message-author-role]"],
    assistantMarkdown: [".markdown.prose", ".markdown", "[class*='markdown']"]
  };

  ns.SIDEBAR_FOLDER_CLASSES = {
    section: "cgca-folder-section",
    headerButton: "cgca-folder-section-header",
    createButton: "cgca-folder-create-button",
    createForm: "cgca-folder-create-form",
    createInput: "cgca-folder-create-input",
    createSubmit: "cgca-folder-create-submit",
    createCancel: "cgca-folder-create-cancel",
    folderBlock: "cgca-folder-block",
    folderRow: "cgca-folder-row",
    folderToggleButton: "cgca-folder-toggle-button",
    folderRowExpanded: "cgca-folder-row-expanded",
    folderRowBody: "cgca-folder-row-body",
    folderTrailing: "cgca-folder-trailing",
    folderRowDropTarget: "cgca-folder-drop-target",
    folderChildren: "cgca-folder-children",
    folderChildrenDropTarget: "cgca-folder-children-drop-target",
    unassignedDropTarget: "cgca-unassigned-drop-target",
    emptyState: "cgca-folder-empty-state",
    cachedConversation: "cgca-cached-conversation",
    cachedConversationLabel: "cgca-cached-conversation-label",
    dragging: "cgca-chat-dragging",
    menuButton: "cgca-folder-menu-button",
    menuWrap: "cgca-folder-menu-wrap",
    count: "cgca-folder-count",
    createLabel: "cgca-folder-create-label",
    menuPanel: "cgca-folder-menu-panel",
    menuAction: "cgca-folder-menu-action",
    menuActions: "cgca-folder-menu-actions",
    menuActionsInline: "cgca-folder-menu-actions-inline",
    menuActionDanger: "cgca-folder-menu-action-danger",
    menuNotice: "cgca-folder-menu-notice",
    renameForm: "cgca-folder-rename-form",
    renameInput: "cgca-folder-rename-input"
  };

  ns.CONVERSATION_TOC_CLASSES = {
    rail: "cgca-conversation-toc-rail",
    pill: "cgca-conversation-toc-pill",
    surface: "cgca-conversation-toc-surface",
    dotsViewport: "cgca-conversation-toc-dots-viewport",
    dots: "cgca-conversation-toc-dots",
    dot: "cgca-conversation-toc-dot",
    dotActive: "is-active",
    dotCore: "cgca-conversation-toc-dot-core",
    branch: "cgca-conversation-toc-branch",
    branchMark: "cgca-conversation-toc-branch-mark",
    branchMarkActive: "is-active",
    card: "cgca-conversation-toc-card",
    cardEyebrow: "cgca-conversation-toc-card-eyebrow",
    cardTitle: "cgca-conversation-toc-card-title",
    cardMeta: "cgca-conversation-toc-card-meta",
    cardExcerpt: "cgca-conversation-toc-card-excerpt",
    cardActions: "cgca-conversation-toc-card-actions",
    cardActionButton: "cgca-conversation-toc-card-action-button",
    outline: "cgca-conversation-toc-outline",
    outlineItem: "cgca-conversation-toc-outline-item",
    outlineItemMinor: "is-minor",
    outlineItemActive: "is-active",
    empty: "cgca-conversation-toc-empty"
  };

  ns.queryAllByFallbackSelectors = function queryAllByFallbackSelectors(root, selectors) {
    for (const selector of selectors) {
      const nodes = Array.from(root.querySelectorAll(selector));
      if (nodes.length > 0) {
        return nodes;
      }
    }
    return [];
  };

  ns.findFirstByFallbackSelectors = function findFirstByFallbackSelectors(root, selectors) {
    for (const selector of selectors) {
      const node = root.querySelector(selector);
      if (node) {
        return node;
      }
    }
    return null;
  };

  ns.cleanText = function cleanText(text) {
    return (text || "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  };

  ns.isConversationRoute = function isConversationRoute(pathname = window.location.pathname) {
    return /\/c\/[0-9a-f-]+/i.test(String(pathname || ""));
  };

  ns.sleep = function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };

  ns.cleanInlineText = function cleanInlineText(text) {
    return (text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\s*\n\s*/g, "\n");
  };

  ns.normalizeTitle = function normalizeTitle(rawTitle) {
    const title = (rawTitle || "").replace(/\s*-\s*ChatGPT\s*$/i, "").trim();
    return title || "Untitled Conversation";
  };

  ns.getConversationIdFromHref = function getConversationIdFromHref(href) {
    const match = String(href || "").match(/\/c\/([0-9a-f-]+)/i);
    return match ? match[1] : "";
  };

  ns.getConversationTitleFromAnchor = function getConversationTitleFromAnchor(anchor) {
    if (!anchor) return "";
    const primary = anchor.querySelector(".truncate");
    return ns.cleanText(primary?.textContent || anchor.textContent || "");
  };

  ns.getConversationAbsoluteUrl = function getConversationAbsoluteUrl(anchor) {
    const href = anchor?.getAttribute("href") || "";
    if (!href) return "";
    return new URL(href, window.location.origin).toString();
  };

  ns.findConversationAnchor = function findConversationAnchor(conversationId) {
    return document.querySelector(`a[data-cgca-conversation-id="${CSS.escape(conversationId)}"]`);
  };

  ns.queryConversationMain = function queryConversationMain() {
    return ns.findFirstByFallbackSelectors(document, ns.SELECTOR_MAP.conversationMain);
  };

  ns.sendRuntimeMessage = async function sendRuntimeMessage(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      console.warn("Runtime message failed:", message?.type, error);
      return { ok: false, error: error?.message || "Unknown runtime error" };
    }
  };
})();
