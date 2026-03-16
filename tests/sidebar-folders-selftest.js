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

function createChromeStub(initialFolderState) {
  const storageData = {
    "sidebarFolders.v1": initialFolderState
  };

  return {
    storageData,
    chrome: {
      runtime: {
        onInstalled: {
          addListener() {}
        },
        onMessage: {
          addListener() {}
        },
        async sendMessage() {
          return { ok: true };
        }
      },
      sidePanel: {
        async setPanelBehavior() {}
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

function loadBackgroundHooks(initialFolderState) {
  const source = `${fs.readFileSync(BACKGROUND_PATH, "utf8")}
;globalThis.__sidebarFolderSelftestHooks = {
  deleteSidebarFolder,
  SIDEBAR_FOLDER_STORAGE_KEY
};`;
  const { chrome, storageData } = createChromeStub(initialFolderState);
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
    storageData
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

  vm.createContext(context);
  for (const filePath of CONTENT_MODULES) {
    vm.runInContext(fs.readFileSync(filePath, "utf8"), context, { filename: filePath });
  }

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

async function run() {
  await runBackgroundDeleteTest();
  const domReport = runFloatingMenuDomTest();

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(domReport, null, 2));

  console.log("[PASS] Sidebar folders self-test passed.");
}

run().catch((error) => {
  console.error("[FAIL] Sidebar folders self-test failed.");
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
