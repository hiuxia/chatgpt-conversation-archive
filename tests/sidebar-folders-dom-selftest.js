const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const REPORT_PATH = path.join(__dirname, "reports", "sidebar-folders-dom-selftest-report.json");
const MODULES = [
  path.join(PROJECT_ROOT, "extension", "content", "runtime.js"),
  path.join(PROJECT_ROOT, "extension", "content", "sidebar-folders.js")
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function wait(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadModules(context) {
  vm.createContext(context);
  for (const filePath of MODULES) {
    const source = fs.readFileSync(filePath, "utf8");
    vm.runInContext(source, context);
  }
}

async function run() {
  const dom = new JSDOM(
    `
      <nav aria-label="Chat history">
        <div class="group/sidebar-expando-section"><button>Projects</button></div>
        <div class="group/sidebar-expando-section" id="your-chats">
          <button>Your chats</button>
          <div id="history">
            <a data-sidebar-item="true" href="/c/abc123ef-1111-2222-3333-444444444444"><div class="truncate">Chat One</div></a>
            <a data-sidebar-item="true" href="/c/bcd234fa-5555-6666-7777-888888888888"><div class="truncate">Chat Two</div></a>
          </div>
        </div>
      </nav>
    `,
    { url: "https://chatgpt.com/" }
  );

  const state = {
    folders: [
      {
        id: "fld_1",
        name: "Research",
        expanded: true,
        order: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    assignments: {
      "abc123ef-1111-2222-3333-444444444444": {
        folderId: "fld_1",
        title: "Chat One",
        url: "https://chatgpt.com/c/abc123ef-1111-2222-3333-444444444444",
        updatedAt: new Date().toISOString()
      }
    },
    ui: {
      sectionExpanded: true
    }
  };

  const chromeStub = {
    runtime: {
      async sendMessage(message) {
        if (message.type === "GET_SIDEBAR_FOLDER_STATE") {
          return { ok: true, state };
        }
        if (message.type === "RENAME_SIDEBAR_FOLDER") {
          const folder = state.folders.find((item) => item.id === message.folderId);
          if (folder) {
            folder.name = String(message.name || "").trim() || folder.name;
          }
          return { ok: true, state };
        }
        if (message.type === "DELETE_SIDEBAR_FOLDER") {
          state.folders = state.folders.filter((item) => item.id !== message.folderId);
          return { ok: true, state };
        }
        if (message.type === "SET_SIDEBAR_FOLDER_EXPANDED") {
          const folder = state.folders.find((item) => item.id === message.folderId);
          folder.expanded = message.expanded !== false;
          return { ok: true, state };
        }
        if (message.type === "ASSIGN_SIDEBAR_CONVERSATION") {
          state.assignments[message.conversationId] = {
            folderId: message.folderId,
            title: String(message.title || ""),
            url: String(message.url || ""),
            updatedAt: new Date().toISOString()
          };
          return { ok: true, state };
        }
        return { ok: true, state };
      }
    }
  };

  const context = {
    window: dom.window,
    document: dom.window.document,
    Node: dom.window.Node,
    Element: dom.window.Element,
    MutationObserver: dom.window.MutationObserver,
    URL: dom.window.URL,
    CSS: {
      ...(dom.window.CSS || {}),
      escape: (value) => String(value).replace(/["\\]/g, "\\$&")
    },
    chrome: chromeStub,
    console,
    setTimeout,
    clearTimeout
  };
  context.globalThis = context;
  let promptCalls = 0;
  context.window.prompt = () => {
    promptCalls += 1;
    return null;
  };

  loadModules(context);

  const ns = context.__chatgptConversationArchiveContent;
  const controller = ns.createSidebarFolderController();
  controller.state = state;
  await controller.render();

  const nav = dom.window.document.querySelector('nav[aria-label="Chat history"]');
  const foldersSection = nav.querySelector(".cgca-folder-section");
  assert(foldersSection, "Folders section was not injected.");
  assert(
    nav.children[1] === foldersSection,
    "Folders section should be inserted before the Your chats section."
  );

  const movedChat = foldersSection.querySelector(
    'a[href="/c/abc123ef-1111-2222-3333-444444444444"]'
  );
  assert(movedChat, "Assigned conversation should move into the folder children.");

  const createButton = foldersSection.querySelector(".cgca-folder-create-button");
  createButton.click();
  await wait(0);
  assert(
    foldersSection.querySelector(".cgca-folder-create-form"),
    "Clicking New folder should show the inline create form."
  );

  controller.isCreatingFolder = false;
  await controller.render();
  const folderToggleButton = foldersSection.querySelector(".cgca-folder-toggle-button");
  assert(folderToggleButton, "Folder row should render a dedicated toggle button.");
  assert(
    folderToggleButton.tagName === "BUTTON",
    "Folder toggle control should be a real button element."
  );
  const folderCaret = foldersSection.querySelector(".cgca-folder-caret");
  assert(folderCaret, "Folder row should render a dedicated caret indicator.");
  assert(
    folderCaret.querySelector("svg"),
    "Folder caret should render as an icon instead of a plain text triangle."
  );

  folderToggleButton.click();
  await wait(10);
  const folderRow = foldersSection.querySelector(".cgca-folder-row");
  assert(
    folderRow.getAttribute("aria-expanded") === "false",
    "Clicking folder row should optimistically toggle expanded state."
  );

  const menuButton = foldersSection.querySelector(".cgca-folder-menu-button");
  const trailingControls = foldersSection.querySelector(".cgca-folder-trailing");
  assert(trailingControls, "Folder row should render a dedicated trailing controls container.");
  assert(
    !trailingControls.className.includes("trailing-pair"),
    "Folder trailing controls should not depend on ChatGPT's native trailing-pair layout."
  );
  const menuWrap = foldersSection.querySelector(".cgca-folder-menu-wrap");
  assert(menuWrap, "Folder menu button should render inside a dedicated menu wrapper.");
  assert(
    !menuWrap.className.includes("trailing"),
    "Folder menu wrapper should not depend on ChatGPT's native trailing wrapper classes."
  );
  assert(
    !menuButton.className.includes("__menu-item-trailing-btn"),
    "Folder menu button should use our own layout classes instead of the native trailing button class."
  );
  menuButton.click();
  await wait(0);
  const menuPanel = foldersSection.querySelector(".cgca-folder-menu-panel");
  assert(menuPanel, "Clicking folder menu should open an inline action panel.");
  assert(
    menuPanel.parentElement?.classList.contains("cgca-folder-menu-wrap"),
    "Folder menu panel should be anchored to the menu wrapper instead of pushing sibling rows in normal flow."
  );
  assert(promptCalls === 0, "Folder menu should not open a window prompt.");
  await wait(120);
  assert(
    foldersSection.querySelector(".cgca-folder-menu-panel"),
    "Folder menu should stay open instead of flickering away."
  );

  foldersSection.querySelector(".cgca-folder-menu-button").click();
  await wait(0);
  assert(
    !foldersSection.querySelector(".cgca-folder-menu-panel"),
    "Clicking the menu button again should close the menu."
  );

  foldersSection.querySelector(".cgca-folder-menu-button").click();
  await wait(0);

  const renameAction = foldersSection.querySelector(".cgca-folder-menu-action");
  renameAction.click();
  await wait(0);
  assert(
    foldersSection.querySelector(".cgca-folder-rename-form"),
    "Rename should render as an inline sidebar form."
  );
  dom.window.document.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })
  );
  await wait(0);
  assert(
    !foldersSection.querySelector(".cgca-folder-menu-panel"),
    "Pressing Escape should close the open folder menu."
  );

  foldersSection.querySelector(".cgca-folder-menu-button").click();
  await wait(0);
  assert(
    foldersSection.querySelector(".cgca-folder-menu-panel"),
    "Menu should reopen after being closed."
  );
  nav.querySelector('#your-chats button').dispatchEvent(
    new dom.window.MouseEvent("pointerdown", { bubbles: true })
  );
  await wait(0);
  assert(
    !foldersSection.querySelector(".cgca-folder-menu-panel"),
    "Clicking elsewhere in the sidebar should close the folder menu."
  );

  controller.openMenuFolderId = "";
  controller.renamingFolderId = "";
  controller.renameDraft = "";
  await controller.render();

  const chatTwo = nav.querySelector('a[href="/c/bcd234fa-5555-6666-7777-888888888888"]');
  assert(chatTwo, "Second conversation should still exist before drag assignment.");
  controller.handleDragStart(chatTwo, {
    dataTransfer: {
      effectAllowed: "",
      setData() {}
    }
  });
  await controller.assignDraggedConversation("fld_1");
  await wait(0);
  await controller.render();

  const folderChildren = foldersSection.querySelector(".cgca-folder-children");
  const movedAfterAssign = folderChildren.querySelector(
    'a[href="/c/bcd234fa-5555-6666-7777-888888888888"]'
  );
  assert(
    movedAfterAssign,
    "Dragging a conversation into a folder should immediately render it inside folder children."
  );

  const report = {
    endedAt: new Date().toISOString(),
    result: "passed",
    sectionText: foldersSection.textContent.trim()
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  console.log("[PASS] Sidebar folders DOM self-test passed.");
  console.log(`Report: ${REPORT_PATH}`);
}

run().catch((error) => {
  const report = {
    endedAt: new Date().toISOString(),
    result: "failed",
    error: error?.message || String(error)
  };
  try {
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  } catch (_) {
    // ignore report write failure
  }
  console.error("[FAIL] Sidebar folders DOM self-test failed.");
  console.error(error?.stack || error);
  process.exitCode = 1;
});
