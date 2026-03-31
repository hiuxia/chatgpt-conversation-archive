const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { webcrypto } = require("crypto");
const { JSDOM } = require("jsdom");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const BACKGROUND_PATH = path.join(PROJECT_ROOT, "extension", "background.js");
const CONTENT_MODULES = [
  path.join(PROJECT_ROOT, "extension", "content", "runtime.js"),
  path.join(PROJECT_ROOT, "extension", "content", "sidebar-folders.js")
];
const REPORT_PATH = path.join(__dirname, "reports", "sidebar-folders-selftest-report.json");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function wait(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadContentModules(context) {
  vm.createContext(context);
  for (const filePath of CONTENT_MODULES) {
    vm.runInContext(fs.readFileSync(filePath, "utf8"), context, { filename: filePath });
  }
}

function createChromeStub(initialFolderState, options = {}) {
  const storageData = {
    "sidebarFolders.v1": initialFolderState
  };
  const runtimeListeners = {
    onInstalled: [],
    onStartup: [],
    onMessage: []
  };
  const executedScripts = [];
  const queryRequests = [];
  const sidePanelCalls = [];

  return {
    storageData,
    executedScripts,
    queryRequests,
    runtimeListeners,
    sidePanelCalls,
    chrome: {
      runtime: {
        onInstalled: {
          addListener(listener) {
            runtimeListeners.onInstalled.push(listener);
          }
        },
        onStartup: {
          addListener(listener) {
            runtimeListeners.onStartup.push(listener);
          }
        },
        onMessage: {
          addListener(listener) {
            runtimeListeners.onMessage.push(listener);
          }
        },
        async sendMessage() {
          return { ok: true };
        }
      },
      sidePanel: {
        async setPanelBehavior(config) {
          sidePanelCalls.push(config);
        }
      },
      tabs: {
        async query(queryInfo) {
          queryRequests.push(queryInfo);
          return [...(options.tabs || [])];
        }
      },
      scripting: {
        async executeScript(details) {
          executedScripts.push(details);
          if (typeof options.onExecuteScript === "function") {
            return options.onExecuteScript(details);
          }
        }
      },
      storage: {
        local: {
          async get(key) {
            if (typeof key === "string") {
              return { [key]: storageData[key] };
            }
            return { ...storageData };
          },
          async set(value) {
            Object.assign(storageData, value);
          }
        }
      }
    }
  };
}

function loadBackgroundHooks(initialFolderState, options = {}) {
  const source = `${fs.readFileSync(BACKGROUND_PATH, "utf8")}
;globalThis.__sidebarFolderSelftestHooks = {
  deleteSidebarFolder,
  reinjectContentScript,
  reinjectContentScriptsIntoOpenChatGptTabs,
  SIDEBAR_FOLDER_STORAGE_KEY
};`;
  const {
    chrome,
    storageData,
    executedScripts,
    queryRequests,
    runtimeListeners,
    sidePanelCalls
  } = createChromeStub(initialFolderState, options);
  const context = {
    console,
    setTimeout,
    clearTimeout,
    TextEncoder,
    URL,
    Blob,
    crypto: webcrypto,
    chrome
  };
  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(source, context, { filename: BACKGROUND_PATH });

  return {
    hooks: context.__sidebarFolderSelftestHooks,
    storageData,
    executedScripts,
    queryRequests,
    runtimeListeners,
    sidePanelCalls
  };
}

function createAssignment(folderId, conversationId, updatedAt) {
  return {
    folderId,
    title: `Conversation ${conversationId}`,
    url: `https://chatgpt.com/c/${conversationId}`,
    updatedAt
  };
}

async function runBackgroundDeleteTest() {
  const timestamp = "2026-03-15T09:00:00.000Z";
  const initialFolderState = {
    schemaVersion: 3,
    folders: [
      {
        id: "root",
        name: "Root",
        parentFolderId: null,
        order: 0,
        expanded: true,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      {
        id: "child",
        name: "Child",
        parentFolderId: "root",
        order: 0,
        expanded: true,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      {
        id: "grandchild",
        name: "Grandchild",
        parentFolderId: "child",
        order: 0,
        expanded: true,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      {
        id: "outside",
        name: "Outside",
        parentFolderId: null,
        order: 1,
        expanded: true,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ],
    assignments: {
      convRoot: createAssignment("root", "convRoot", timestamp),
      convChild: createAssignment("child", "convChild", timestamp),
      convGrandchild: createAssignment("grandchild", "convGrandchild", timestamp),
      convOutside: createAssignment("outside", "convOutside", timestamp)
    },
    ui: {
      sectionExpanded: true
    }
  };

  const { hooks, storageData } = loadBackgroundHooks(initialFolderState);
  const deleteResponse = await hooks.deleteSidebarFolder("root");
  assert(deleteResponse?.ok, "Deleting a folder tree should succeed.");

  const state = deleteResponse.state;
  assert(
    JSON.stringify(state.folders.map((folder) => folder.id)) === JSON.stringify(["outside"]),
    "Deleting a folder should remove every descendant folder."
  );
  assert(
    JSON.stringify(Object.keys(state.assignments).sort()) === JSON.stringify(["convOutside"]),
    "Deleting a folder should clear assignments for the full subtree."
  );
  assert(
    Object.keys(state.conversationCatalog).sort().join(",") ===
      ["convChild", "convGrandchild", "convOutside", "convRoot"].join(","),
    "Deleting a folder tree should keep cached conversations available for Your chats."
  );

  const persistedState = storageData[hooks.SIDEBAR_FOLDER_STORAGE_KEY];
  assert(
    JSON.stringify(persistedState.folders.map((folder) => folder.id)) === JSON.stringify(["outside"]),
    "Deleting a folder tree should persist the recursive delete result."
  );
}

async function runBackgroundLifecycleRecoveryTest() {
  const {
    hooks,
    executedScripts,
    queryRequests,
    runtimeListeners,
    sidePanelCalls
  } = loadBackgroundHooks(null, {
    tabs: [
      {
        id: 11,
        url: "https://chatgpt.com/c/69c026ec-d534-83a2-9510-35b7ce8b0e65"
      },
      {
        id: 12,
        url: "https://chatgpt.com/"
      },
      {
        url: "https://chatgpt.com/c/missing-id"
      }
    ]
  });

  assert(
    runtimeListeners.onInstalled.length === 1,
    "Background should register an onInstalled lifecycle listener."
  );
  assert(
    runtimeListeners.onStartup.length === 1,
    "Background should register an onStartup lifecycle listener."
  );

  await hooks.reinjectContentScriptsIntoOpenChatGptTabs();
  assert(
    JSON.stringify(queryRequests[0]) === JSON.stringify({ url: ["https://chatgpt.com/*"] }),
    "Open-tab reinjection should query only chatgpt.com tabs."
  );
  assert(
    executedScripts.filter((call) => typeof call.func === "function").length === 2,
    "Open-tab reinjection should reset every matching tab before injecting new content scripts."
  );
  assert(
    executedScripts.filter((call) => Array.isArray(call.files)).length === 2,
    "Open-tab reinjection should inject the content script bundle into every matching tab with an id."
  );
  assert(
    executedScripts
      .filter((call) => Array.isArray(call.files))
      .every((call) => call.files.includes("content/sidebar-folders.js")),
    "Reinjection should include the sidebar folder content script bundle."
  );

  await runtimeListeners.onInstalled[0]();
  assert(
    sidePanelCalls.length === 1,
    "Install recovery should preserve side panel behavior setup."
  );
  assert(
    executedScripts.length === 8,
    "Install recovery should also reinject content scripts into open ChatGPT tabs."
  );

  await runtimeListeners.onStartup[0]();
  assert(
    executedScripts.length === 12,
    "Startup recovery should reinject content scripts into restored ChatGPT tabs."
  );
}

async function runReinjectResetLifecycleTest() {
  const conversationId = "69c026ec-d534-83a2-9510-35b7ce8b0e65";
  const folderState = {
    folders: [],
    assignments: {},
    conversations: [],
    ui: {
      sectionExpanded: true
    }
  };
  const dom = new JSDOM(
    `
      <nav aria-label="Chat history">
        <section>
          <div id="history">
            <a href="/c/${conversationId}">
              <span class="truncate">Reinject test chat</span>
            </a>
          </div>
        </section>
      </nav>
      <main>
        <section data-testid="conversation-turn-1" data-turn="user" data-scroll-anchor="false">
          <div data-message-author-role="user">How do we recover stale content scripts?</div>
        </section>
        <section data-testid="conversation-turn-2" data-turn="assistant" data-scroll-anchor="true">
          <div data-message-author-role="assistant">
            <div class="markdown prose">
              <h2>Recovery plan</h2>
              <p>Reset the old runtime before reinjecting.</p>
            </div>
          </div>
        </section>
      </main>
    `,
    {
      url: `https://chatgpt.com/c/${conversationId}`
    }
  );
  class IntersectionObserverStub {
    constructor(callback) {
      this.callback = callback;
      this.elements = new Set();
    }

    observe(element) {
      this.elements.add(element);
    }

    disconnect() {
      this.elements.clear();
    }
  }

  const pageContext = {
    window: dom.window,
    document: dom.window.document,
    Node: dom.window.Node,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver,
    IntersectionObserver: IntersectionObserverStub,
    URL: dom.window.URL,
    AbortController: dom.window.AbortController || AbortController,
    CSS: {
      ...(dom.window.CSS || {}),
      escape: (value) => String(value).replace(/["\\]/g, "\\$&")
    },
    chrome: {
      runtime: {
        onMessage: {
          addListener(listener) {
            return listener;
          }
        },
        async sendMessage(message) {
          if (
            message?.type === "GET_SIDEBAR_FOLDER_STATE" ||
            message?.type === "UPSERT_SIDEBAR_CONVERSATIONS"
          ) {
            return { ok: true, state: folderState };
          }

          return { ok: true };
        }
      }
    },
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    cancelAnimationFrame: (id) => clearTimeout(id)
  };
  pageContext.globalThis = pageContext;
  pageContext.window.alert = () => {};
  vm.createContext(pageContext);

  const { hooks } = loadBackgroundHooks(null, {
    onExecuteScript(details) {
      if (typeof details.func === "function") {
        vm.runInContext(`(${details.func.toString()})();`, pageContext, {
          filename: "reinject-reset.js"
        });
        return;
      }

      for (const relativePath of details.files || []) {
        const filePath = path.join(PROJECT_ROOT, "extension", relativePath);
        vm.runInContext(fs.readFileSync(filePath, "utf8"), pageContext, { filename: filePath });
      }
    }
  });

  await hooks.reinjectContentScript(11);
  await wait(20);

  const firstNs = pageContext.__chatgptConversationArchiveContent;
  const firstSidebarController = firstNs?.sidebarFolderController;
  const firstTocController = firstNs?.conversationTocController;

  assert(
    firstNs && pageContext.__chatgptConversationArchiveInjected === true,
    "Initial reinjection should bootstrap the shared content runtime."
  );
  assert(
    firstSidebarController?.started === true,
    "Initial reinjection should start the sidebar folder controller."
  );
  assert(
    firstTocController?.started === true,
    "Initial reinjection should start the conversation TOC controller."
  );
  assert(
    dom.window.document.querySelectorAll(".cgca-folder-section").length === 1,
    "Initial reinjection should render one sidebar folder section."
  );
  assert(
    dom.window.document.querySelectorAll(".cgca-conversation-toc-rail").length === 1,
    "Initial reinjection should render one conversation TOC rail."
  );

  await hooks.reinjectContentScript(11);
  await wait(20);

  const secondNs = pageContext.__chatgptConversationArchiveContent;

  assert(
    secondNs && secondNs !== firstNs,
    "Reinjecting into an already open tab should replace the stale shared runtime object."
  );
  assert(
    firstSidebarController?.started === false,
    "Reinjecting should stop the previous sidebar folder controller before replacing it."
  );
  assert(
    firstTocController?.started === false,
    "Reinjecting should stop the previous conversation TOC controller before replacing it."
  );
  assert(
    secondNs.sidebarFolderController?.started === true,
    "Reinjecting should restart the sidebar folder controller with the fresh runtime."
  );
  assert(
    secondNs.conversationTocController?.started === true,
    "Reinjecting should restart the conversation TOC controller with the fresh runtime."
  );
  assert(
    dom.window.document.querySelectorAll(".cgca-folder-section").length === 1,
    "Reinjecting should leave only one sidebar folder section in the DOM."
  );
  assert(
    dom.window.document.querySelectorAll(".cgca-conversation-toc-rail").length === 1,
    "Reinjecting should leave only one conversation TOC rail in the DOM."
  );
}

function runSidebarPerformanceHelperTest() {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: "https://chatgpt.com/"
  });
  const context = {
    window: dom.window,
    document: dom.window.document,
    Node: dom.window.Node,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver,
    URL: dom.window.URL,
    AbortController: dom.window.AbortController || AbortController,
    CSS: {
      ...(dom.window.CSS || {}),
      escape: (value) => String(value).replace(/["\\]/g, "\\$&")
    },
    chrome: {
      runtime: {
        async sendMessage() {
          return { ok: true };
        }
      }
    },
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    cancelAnimationFrame: (id) => clearTimeout(id)
  };
  context.globalThis = context;

  loadContentModules(context);

  const ns = context.__chatgptConversationArchiveContent;
  const tree = ns.buildFolderTree([
    { id: "root", name: "Root", parentFolderId: null, order: 0, expanded: true },
    { id: "child", name: "Child", parentFolderId: "root", order: 0, expanded: true },
    { id: "leaf", name: "Leaf", parentFolderId: "child", order: 0, expanded: true }
  ]);
  const counts = ns.buildAssignedChatCountMap(
    {
      assignments: {
        a: { folderId: "root" },
        b: { folderId: "child" },
        c: { folderId: "leaf" }
      }
    },
    tree
  );
  assert(counts.get("root") === 3, "Assigned chat counts should roll descendant chats into the root.");
  assert(counts.get("child") === 2, "Assigned chat counts should roll descendant chats into parents.");
  assert(counts.get("leaf") === 1, "Assigned chat counts should preserve direct folder totals.");

  const sidebarAnchor = dom.window.document.createElement("a");
  sidebarAnchor.dataset.sidebarItem = "true";
  sidebarAnchor.href = "https://chatgpt.com/c/conv-1";
  assert(
    ns.shouldScheduleSidebarRender([{ addedNodes: [sidebarAnchor], removedNodes: [] }]),
    "Sidebar render watcher should react to chat row insertions."
  );

  const transientButton = dom.window.document.createElement("button");
  transientButton.textContent = "Open conversation options";
  assert(
    !ns.shouldScheduleSidebarRender([{ addedNodes: [transientButton], removedNodes: [] }]),
    "Sidebar render watcher should ignore transient non-chat DOM insertions."
  );

  const menu = dom.window.document.createElement("div");
  menu.setAttribute("role", "menu");
  assert(
    ns.shouldScheduleNativeConversationMenuSync([{ addedNodes: [menu], removedNodes: [] }]),
    "Native menu watcher should react to menu portals."
  );

  const toast = dom.window.document.createElement("div");
  toast.textContent = "Saved";
  assert(
    !ns.shouldScheduleNativeConversationMenuSync([{ addedNodes: [toast], removedNodes: [] }]),
    "Native menu watcher should ignore unrelated body mutations."
  );
}

function runFloatingMenuDomTest() {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: "https://chatgpt.com/"
  });

  Object.defineProperty(dom.window, "innerWidth", {
    configurable: true,
    value: 320
  });
  Object.defineProperty(dom.window, "innerHeight", {
    configurable: true,
    value: 240
  });

  const context = {
    window: dom.window,
    document: dom.window.document,
    Node: dom.window.Node,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver,
    URL: dom.window.URL,
    AbortController: dom.window.AbortController || AbortController,
    CSS: {
      ...(dom.window.CSS || {}),
      escape: (value) => String(value).replace(/["\\]/g, "\\$&")
    },
    chrome: {
      runtime: {
        async sendMessage() {
          return { ok: true };
        }
      }
    },
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    cancelAnimationFrame: (id) => clearTimeout(id)
  };
  context.globalThis = context;

  loadContentModules(context);

  const ns = context.__chatgptConversationArchiveContent;
  ns.ensureSidebarFolderStyles();

  const controller = ns.createSidebarFolderController();
  const menuButton = dom.window.document.createElement("button");
  menuButton.className = ns.SIDEBAR_FOLDER_CLASSES.menuButton;
  menuButton.dataset.folderId = "root";
  menuButton.getBoundingClientRect = () => ({
    top: 28,
    left: 190,
    right: 222,
    bottom: 60,
    width: 32,
    height: 32
  });
  dom.window.document.body.appendChild(menuButton);
  controller.registerMenuButton("root", menuButton);
  controller.openMenuFolderId = "root";
  controller.pendingDeleteFolderId = "root";

  const originalRect = dom.window.HTMLElement.prototype.getBoundingClientRect;
  dom.window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    if (this.classList?.contains(ns.SIDEBAR_FOLDER_CLASSES.menuPanel)) {
      return {
        top: 0,
        left: 0,
        right: 240,
        bottom: 144,
        width: 240,
        height: 144
      };
    }

    return originalRect.call(this);
  };

  const state = {
    folders: [
      { id: "root", name: "Root", parentFolderId: null, order: 0, expanded: true },
      { id: "child", name: "Child", parentFolderId: "root", order: 0, expanded: true }
    ]
  };
  const tree = ns.buildFolderTree(state.folders);
  ns.renderFloatingFolderMenu({ controller, state, tree });

  const portal = dom.window.document.body.querySelector(`.${ns.SIDEBAR_FOLDER_CLASSES.menuPortal}`);
  assert(portal, "Folder menu should render into a body-level portal.");
  const panel = portal.querySelector(`.${ns.SIDEBAR_FOLDER_CLASSES.menuPanel}`);
  assert(panel, "Folder menu portal should contain the menu panel.");
  assert(
    panel.querySelector(`.${ns.SIDEBAR_FOLDER_CLASSES.menuNotice}`)?.textContent.includes("subfolder will be deleted"),
    "Delete confirmation should explain that child folders are deleted with the parent."
  );

  const styleText =
    dom.window.document.getElementById("cgca-sidebar-folder-styles")?.textContent || "";
  assert(
    styleText.includes(`.${ns.SIDEBAR_FOLDER_CLASSES.menuPortal}`),
    "Sidebar styles should define a body-level menu portal."
  );
  assert(
    styleText.includes("max-height: min(18rem, calc(100vh - 1rem));"),
    "Menu panel styles should cap height inside the viewport."
  );
  assert(
    styleText.includes("overscroll-behavior: contain;"),
    "Menu panel styles should allow internal scrolling when content is long."
  );

  const left = Number.parseInt(panel.style.left || "0", 10);
  const top = Number.parseInt(panel.style.top || "0", 10);
  assert(left >= 8, "Floating menu should clamp horizontally into the viewport.");
  assert(top >= 8, "Floating menu should clamp vertically into the viewport.");

  dom.window.HTMLElement.prototype.getBoundingClientRect = originalRect;

  return {
    panelLeft: left,
    panelTop: top,
    notice: panel.querySelector(`.${ns.SIDEBAR_FOLDER_CLASSES.menuNotice}`)?.textContent || ""
  };
}

async function runNativeConversationMenuInjectionTest() {
  const dom = new JSDOM(
    `
      <!doctype html>
      <html>
        <head></head>
        <body>
          <a href="/c/conv-1" data-sidebar-item="true">
            <span>Conversation One</span>
            <button aria-label="Open conversation options for Conversation One"></button>
          </a>
          <div role="menu">
            <div role="menuitem" class="group __menu-item">Move to project</div>
            <div role="menuitem" class="group __menu-item">Pin chat</div>
            <div role="menuitem" class="group __menu-item" data-testid="delete-chat-menu-item">Delete</div>
          </div>
        </body>
      </html>
    `,
    {
      url: "https://chatgpt.com/c/conv-1"
    }
  );

  Object.defineProperty(dom.window, "innerWidth", {
    configurable: true,
    value: 360
  });
  Object.defineProperty(dom.window, "innerHeight", {
    configurable: true,
    value: 240
  });

  const initialState = {
    folders: [
      { id: "root", name: "Root", parentFolderId: null, order: 0, expanded: true },
      { id: "child", name: "Child", parentFolderId: "root", order: 0, expanded: true }
    ],
    assignments: {},
    ui: {
      sectionExpanded: true
    }
  };
  const sentMessages = [];

  const context = {
    window: dom.window,
    document: dom.window.document,
    Node: dom.window.Node,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver,
    URL: dom.window.URL,
    AbortController: dom.window.AbortController || AbortController,
    CSS: {
      ...(dom.window.CSS || {}),
      escape: (value) => String(value).replace(/["\\]/g, "\\$&")
    },
    chrome: {
      runtime: {
        async sendMessage(message) {
          sentMessages.push(message);
          if (message?.type === "GET_SIDEBAR_FOLDER_STATE") {
            return { ok: true, state: initialState };
          }
          if (message?.type === "ASSIGN_SIDEBAR_CONVERSATION") {
            return {
              ok: true,
              state: {
                ...initialState,
                assignments: {
                  "conv-1": {
                    folderId: message.folderId,
                    title: message.title,
                    url: message.url,
                    updatedAt: "2026-03-23T00:00:00.000Z"
                  }
                }
              }
            };
          }
          return { ok: true, state: initialState };
        }
      }
    },
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    cancelAnimationFrame: (id) => clearTimeout(id)
  };
  context.globalThis = context;

  loadContentModules(context);

  const ns = context.__chatgptConversationArchiveContent;
  ns.ensureSidebarFolderStyles();

  const controller = ns.createSidebarFolderController();
  controller.start();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const projectMenuItem = dom.window.document.querySelector('[role="menuitem"]');
  projectMenuItem.setAttribute("aria-haspopup", "menu");
  projectMenuItem.getBoundingClientRect = () => ({
    top: 36,
    left: 148,
    right: 260,
    bottom: 68,
    width: 112,
    height: 32
  });

  dom.window.document.body.dispatchEvent(
    new dom.window.MouseEvent("pointerdown", {
      bubbles: true
    })
  );

  controller.nativeConversationMenuContext = {
    conversationId: "conv-1",
    title: "Conversation One",
    url: "https://chatgpt.com/c/conv-1"
  };
  controller.syncNativeConversationMenu();

  const injectedItem = dom.window.document.querySelector(
    `.${ns.SIDEBAR_FOLDER_CLASSES.nativeConversationMenuItem}`
  );
  assert(injectedItem, "Native chat menu should include a Move to folders item.");
  assert(
    injectedItem.textContent.includes("Move to folders"),
    "Injected native menu item should use the Move to folders label."
  );

  const openNativeProjectSubmenu = () => {
    projectMenuItem.setAttribute("aria-expanded", "true");
    projectMenuItem.setAttribute("data-state", "open");
    projectMenuItem.setAttribute("aria-controls", "native-project-submenu");

    const projectSubmenu = dom.window.document.createElement("div");
    projectSubmenu.id = "native-project-submenu";
    projectSubmenu.setAttribute("role", "menu");
    projectSubmenu.textContent = "Project Alpha";
    dom.window.document.body.appendChild(projectSubmenu);
    return projectSubmenu;
  };

  const originalRect = dom.window.HTMLElement.prototype.getBoundingClientRect;
  dom.window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    if (this.classList?.contains(ns.SIDEBAR_FOLDER_CLASSES.nativeConversationSubmenuPanel)) {
      return {
        top: 0,
        left: 0,
        right: 224,
        bottom: 168,
        width: 224,
        height: 168
      };
    }

    if (this === injectedItem) {
      return {
        top: 68,
        left: 148,
        right: 260,
        bottom: 100,
        width: 112,
        height: 32
      };
    }

    return originalRect.call(this);
  };

  const projectSubmenu = openNativeProjectSubmenu();
  injectedItem.dispatchEvent(
    new dom.window.MouseEvent("click", {
      bubbles: true
    })
  );

  const submenu = dom.window.document.querySelector(
    `.${ns.SIDEBAR_FOLDER_CLASSES.nativeConversationSubmenuPanel}`
  );
  assert(submenu, "Clicking Move to folders should open a folder picker submenu.");
  assert(
    submenu.textContent.includes("Root") && submenu.textContent.includes("Child"),
    "Folder picker submenu should list available folders."
  );
  assert(
    !projectSubmenu.isConnected,
    "Opening Move to folders should close the native Move to project submenu."
  );
  assert(
    projectMenuItem.getAttribute("aria-expanded") === "false",
    "Opening Move to folders should collapse the native Move to project trigger."
  );

  const childButton = Array.from(submenu.querySelectorAll("button")).find((button) =>
    button.textContent.includes("Child")
  );
  assert(childButton, "Folder picker submenu should include the child folder button.");
  childButton.dispatchEvent(
    new dom.window.MouseEvent("click", {
      bubbles: true
    })
  );
  await new Promise((resolve) => setTimeout(resolve, 0));

  const assignMessage = sentMessages.find((message) => message?.type === "ASSIGN_SIDEBAR_CONVERSATION");
  assert(assignMessage, "Selecting a folder from the native menu should send an assignment message.");
  assert(
    assignMessage.conversationId === "conv-1" && assignMessage.folderId === "child",
    "Assignment message should target the selected conversation and folder."
  );

  injectedItem.dispatchEvent(
    new dom.window.MouseEvent("click", {
      bubbles: true
    })
  );
  assert(
    dom.window.document.querySelector(`.${ns.SIDEBAR_FOLDER_CLASSES.nativeConversationSubmenuPanel}`),
    "Move to folders should still reopen after assigning a conversation."
  );

  openNativeProjectSubmenu();
  controller.syncNativeConversationMenu();
  assert(
    !dom.window.document.querySelector(`.${ns.SIDEBAR_FOLDER_CLASSES.nativeConversationSubmenuPanel}`),
    "Opening the native Move to project submenu should close the folders submenu."
  );

  injectedItem.dispatchEvent(
    new dom.window.MouseEvent("click", {
      bubbles: true
    })
  );
  assert(
    dom.window.document.querySelector(`.${ns.SIDEBAR_FOLDER_CLASSES.nativeConversationSubmenuPanel}`),
    "Move to folders should open before testing native menu teardown."
  );

  const nativeMenu = dom.window.document.querySelector('[role="menu"]');
  nativeMenu?.remove();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert(
    dom.window.document.querySelector(`.${ns.SIDEBAR_FOLDER_CLASSES.nativeConversationSubmenuPanel}`),
    "Folder picker submenu should stay open if ChatGPT closes the native menu after selecting Move to folders."
  );

  dom.window.HTMLElement.prototype.getBoundingClientRect = originalRect;

  return {
    injectedLabel: injectedItem.textContent.trim(),
    assignMessage
  };
}

async function runRuntimeInvalidationTeardownTest() {
  const conversationId = "69c026ec-d534-83a2-9510-35b7ce8b0e65";
  const dom = new JSDOM(
    `
      <!doctype html>
      <html>
        <head></head>
        <body>
          <nav aria-label="Chat history">
            <div>
              <div id="history">
                <a href="/c/${conversationId}" data-sidebar-item="true">
                  <span class="truncate">Conversation One</span>
                </a>
              </div>
            </div>
          </nav>
        </body>
      </html>
    `,
    {
      url: `https://chatgpt.com/c/${conversationId}`
    }
  );

  let runtimeMode = "healthy";
  const initialState = {
    folders: [
      {
        id: "root",
        name: "Root",
        parentFolderId: null,
        order: 0,
        expanded: true
      }
    ],
    assignments: {},
    ui: {
      sectionExpanded: true
    }
  };

  const context = {
    window: dom.window,
    document: dom.window.document,
    Node: dom.window.Node,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver,
    URL: dom.window.URL,
    AbortController: dom.window.AbortController || AbortController,
    CSS: {
      ...(dom.window.CSS || {}),
      escape: (value) => String(value).replace(/["\\]/g, "\\$&")
    },
    chrome: {
      runtime: {
        async sendMessage(message) {
          if (runtimeMode === "invalidated") {
            throw new Error("Extension context invalidated.");
          }

          if (message?.type === "GET_SIDEBAR_FOLDER_STATE") {
            return { ok: true, state: initialState };
          }

          return { ok: true, state: initialState };
        }
      }
    },
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    cancelAnimationFrame: (id) => clearTimeout(id)
  };
  context.globalThis = context;

  loadContentModules(context);

  const ns = context.__chatgptConversationArchiveContent;
  const controller = ns.createSidebarFolderController();
  controller.start();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await controller.render();

  const ownedSectionSelector =
    `.${ns.SIDEBAR_FOLDER_CLASSES.section}[data-cgca-owner="${controller.instanceId}"]`;
  assert(
    dom.window.document.querySelector(ownedSectionSelector),
    "Sidebar controller should stamp its rendered folder section with an owner id."
  );

  runtimeMode = "invalidated";
  controller.visibleConversationSignature = "";
  await controller.syncVisibleConversationCatalog(ns.querySidebarNav());

  assert(
    ns.runtimeContextInvalidated === true,
    "Runtime helper should remember that the extension context is invalidated."
  );
  assert(
    controller.started === false,
    "Sidebar controller should stop after the extension runtime is invalidated."
  );
  assert(
    !dom.window.document.querySelector(ownedSectionSelector),
    "Invalidated sidebar UI should be removed so dead controls are not left behind."
  );
  assert(
    dom.window.document.querySelector(`#history a[href="/c/${conversationId}"]`),
    "Native sidebar anchors should remain in history after the invalidated controller tears down."
  );

  const invalidatedResponse = await ns.sendRuntimeMessage({
    type: ns.MESSAGE_TYPES.GET_SIDEBAR_FOLDER_STATE
  });
  assert(
    ns.isRuntimeInvalidatedResponse(invalidatedResponse),
    "Runtime helper should short-circuit repeated invalidated calls after the first failure."
  );
}

async function run() {
  await runBackgroundDeleteTest();
  await runBackgroundLifecycleRecoveryTest();
  await runReinjectResetLifecycleTest();
  runSidebarPerformanceHelperTest();
  const domReport = runFloatingMenuDomTest();
  const nativeMenuReport = await runNativeConversationMenuInjectionTest();
  await runRuntimeInvalidationTeardownTest();

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        floatingMenu: domReport,
        nativeMenu: nativeMenuReport
      },
      null,
      2
    )
  );

  console.log("[PASS] Sidebar folders self-test passed.");
}

run().catch((error) => {
  console.error("[FAIL] Sidebar folders self-test failed.");
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
