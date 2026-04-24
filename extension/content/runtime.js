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

  ns.RUNTIME_ERROR_CODES = {
    extensionContextInvalidated: "EXTENSION_CONTEXT_INVALIDATED"
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
    turnArticles: [
      'section[data-testid^="conversation-turn-"]',
      "section[data-turn-id]",
      'article[data-testid^="conversation-turn-"]',
      "article[data-turn-id]"
    ],
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
    menuPortal: "cgca-folder-menu-portal",
    menuPanel: "cgca-folder-menu-panel",
    menuAction: "cgca-folder-menu-action",
    menuActions: "cgca-folder-menu-actions",
    menuActionsInline: "cgca-folder-menu-actions-inline",
    menuActionDanger: "cgca-folder-menu-action-danger",
    menuNotice: "cgca-folder-menu-notice",
    renameForm: "cgca-folder-rename-form",
    renameInput: "cgca-folder-rename-input",
    nativeConversationMenuItem: "cgca-native-conversation-menu-item",
    nativeConversationSubmenuPanel: "cgca-native-conversation-submenu-panel",
    nativeConversationSubmenuItem: "cgca-native-conversation-submenu-item",
    nativeConversationSubmenuItemActive: "is-current",
    nativeConversationSubmenuEmpty: "cgca-native-conversation-submenu-empty"
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
      const nodes = [];
      if (root instanceof Element && root.matches(selector)) {
        nodes.push(root);
      }
      nodes.push(...Array.from(root.querySelectorAll(selector)));
      if (nodes.length > 0) {
        return nodes;
      }
    }
    return [];
  };

  ns.runtimeContextInvalidated = false;
  ns.runtimeInvalidationHandlers = ns.runtimeInvalidationHandlers || new Set();

  ns.isRuntimeContextInvalidatedError = function isRuntimeContextInvalidatedError(error) {
    const message = String(error?.message || error || "").toLowerCase();
    return message.includes("extension context invalidated");
  };

  ns.addRuntimeInvalidationHandler = function addRuntimeInvalidationHandler(handler) {
    if (typeof handler !== "function") {
      return function noopRuntimeInvalidationHandlerRemoval() {};
    }

    ns.runtimeInvalidationHandlers.add(handler);
    return function removeRuntimeInvalidationHandler() {
      ns.runtimeInvalidationHandlers.delete(handler);
    };
  };

  ns.handleRuntimeInvalidation = function handleRuntimeInvalidation(error) {
    if (ns.runtimeContextInvalidated) {
      return;
    }

    ns.runtimeContextInvalidated = true;
    for (const handler of Array.from(ns.runtimeInvalidationHandlers)) {
      try {
        handler(error);
      } catch (handlerError) {
        console.warn("Runtime invalidation handler failed:", handlerError);
      }
    }
  };

  ns.isRuntimeInvalidatedResponse = function isRuntimeInvalidatedResponse(response) {
    return response?.code === ns.RUNTIME_ERROR_CODES.extensionContextInvalidated;
  };

  ns.findFirstByFallbackSelectors = function findFirstByFallbackSelectors(root, selectors) {
    for (const selector of selectors) {
      if (root instanceof Element && root.matches(selector)) {
        return root;
      }
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

  ns.decodeUrlPathSegment = function decodeUrlPathSegment(value) {
    try {
      return decodeURIComponent(value);
    } catch (_) {
      return value;
    }
  };

  ns.getConversationIdFromPathname = function getConversationIdFromPathname(
    pathname = window.location.pathname
  ) {
    const match = String(pathname || "").match(/(?:^|\/)c\/([^/?#]+)/i);
    return match ? ns.decodeUrlPathSegment(match[1]) : "";
  };

  ns.isConversationRoute = function isConversationRoute(pathname = window.location.pathname) {
    return Boolean(ns.getConversationIdFromPathname(pathname));
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
    const rawHref = String(href || "").trim();
    if (!rawHref) return "";

    try {
      const parsed = new URL(rawHref, window.location.origin);
      return ns.getConversationIdFromPathname(parsed.pathname);
    } catch (_) {
      const match = rawHref.match(/\/c\/([^/?#]+)/i);
      return match ? ns.decodeUrlPathSegment(match[1]) : "";
    }
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

  ns.getConversationTurnContainers = function getConversationTurnContainers(root = document) {
    const explicitContainers = ns.queryAllByFallbackSelectors(root, ns.SELECTOR_MAP.turnArticles);
    if (explicitContainers.length > 0) {
      return explicitContainers;
    }

    const roleNodes = ns.queryAllByFallbackSelectors(root, ns.SELECTOR_MAP.roleNodes);
    const containers = [];
    const seen = new Set();

    for (const roleNode of roleNodes) {
      const container =
        roleNode.closest(
          [
            'section[data-testid^="conversation-turn-"]',
            "section[data-turn-id]",
            'article[data-testid^="conversation-turn-"]',
            "article[data-turn-id]"
          ].join(",")
        ) || roleNode;
      if (seen.has(container)) continue;
      seen.add(container);
      containers.push(container);
    }

    return containers;
  };

  ns.getConversationTurnRole = function getConversationTurnRole(turnNode) {
    if (!turnNode) return "";

    const explicitRole =
      turnNode.getAttribute?.("data-turn") || turnNode.getAttribute?.("data-message-author-role") || "";
    if (explicitRole) {
      return String(explicitRole).toLowerCase();
    }

    const roleNode = ns.findFirstByFallbackSelectors(turnNode, ns.SELECTOR_MAP.roleNodes);
    return String(roleNode?.getAttribute("data-message-author-role") || "").toLowerCase();
  };

  ns.getConversationTurnRoleNode = function getConversationTurnRoleNode(turnNode, preferredRole = "") {
    if (!turnNode) return null;

    const explicitRole = ns.getConversationTurnRole(turnNode);
    if (
      turnNode.matches?.("[data-message-author-role]") &&
      (!preferredRole || explicitRole === String(preferredRole || "").toLowerCase())
    ) {
      return turnNode;
    }

    const normalizedPreferredRole = String(preferredRole || "").toLowerCase();
    if (normalizedPreferredRole) {
      const preferredNode = turnNode.querySelector(
        `[data-message-author-role="${CSS.escape(normalizedPreferredRole)}"]`
      );
      if (preferredNode) {
        return preferredNode;
      }
    }

    return ns.findFirstByFallbackSelectors(turnNode, ns.SELECTOR_MAP.roleNodes);
  };

  ns.collectConversationMarkdownRoots = function collectConversationMarkdownRoots(root) {
    if (!root) return [];

    const nodes = ns.queryAllByFallbackSelectors(root, ns.SELECTOR_MAP.assistantMarkdown);
    return nodes.filter(
      (node, index) => !nodes.some((other, otherIndex) => otherIndex !== index && other.contains(node))
    );
  };

  ns.collectTurnMarkdownRoots = function collectTurnMarkdownRoots(turnNode, role) {
    const roots = [];
    const seen = new Set();

    const appendRoots = (nodes) => {
      for (const node of nodes || []) {
        if (!node || seen.has(node)) continue;
        seen.add(node);
        roots.push(node);
      }
    };

    const roleNode = ns.getConversationTurnRoleNode(turnNode, role);
    appendRoots(ns.collectConversationMarkdownRoots(roleNode));

    if (turnNode && turnNode !== roleNode) {
      appendRoots(ns.collectConversationMarkdownRoots(turnNode));
    }

    return roots;
  };

  ns.findConversationAnchor = function findConversationAnchor(conversationId) {
    return document.querySelector(`a[data-cgca-conversation-id="${CSS.escape(conversationId)}"]`);
  };

  ns.queryConversationMain = function queryConversationMain() {
    return ns.findFirstByFallbackSelectors(document, ns.SELECTOR_MAP.conversationMain);
  };

  ns.sendRuntimeMessage = async function sendRuntimeMessage(message) {
    if (ns.runtimeContextInvalidated) {
      return {
        ok: false,
        error: "Extension context invalidated.",
        code: ns.RUNTIME_ERROR_CODES.extensionContextInvalidated
      };
    }

    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      const invalidated = ns.isRuntimeContextInvalidatedError(error);
      if (invalidated) {
        ns.handleRuntimeInvalidation(error);
      }

      if (invalidated) {
        return {
          ok: false,
          error: error?.message || "Extension context invalidated.",
          code: ns.RUNTIME_ERROR_CODES.extensionContextInvalidated
        };
      }

      console.warn("Runtime message failed:", message?.type, error);
      return { ok: false, error: error?.message || "Unknown runtime error" };
    }
  };
})();
