const fs = require("fs");
const path = require("path");
const vm = require("vm");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const BACKGROUND_PATH = path.join(PROJECT_ROOT, "extension", "background.js");
const REPORT_PATH = path.join(__dirname, "reports", "folder-store-selftest-report.json");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createChromeStorageStub() {
  const bucket = {};

  return {
    local: {
      async get(key) {
        if (typeof key === "string") {
          return { [key]: bucket[key] };
        }
        if (Array.isArray(key)) {
          return Object.fromEntries(key.map((item) => [item, bucket[item]]));
        }
        return { ...bucket };
      },
      async set(values) {
        Object.assign(bucket, values);
      }
    }
  };
}

function buildContext() {
  const chromeStub = {
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener() {} }
    },
    sidePanel: {
      async setPanelBehavior() {}
    },
    storage: createChromeStorageStub(),
    tabs: {
      async query() {
        return [];
      },
      async sendMessage() {
        return {};
      },
      async create() {
        return { id: 1 };
      },
      async remove() {},
      async get() {
        return { status: "complete", discarded: false };
      },
      onUpdated: {
        addListener() {},
        removeListener() {}
      }
    },
    scripting: {
      async executeScript() {}
    },
    downloads: {
      async download() {}
    }
  };

  return {
    chrome: chromeStub,
    console,
    TextEncoder,
    btoa: (str) => Buffer.from(str, "binary").toString("base64"),
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
  };
}

async function run() {
  const source = fs.readFileSync(BACKGROUND_PATH, "utf8");
  const context = buildContext();
  vm.createContext(context);
  vm.runInContext(source, context);

  assert(typeof context.getSidebarFolderState === "function", "getSidebarFolderState is unavailable.");
  assert(typeof context.createSidebarFolder === "function", "createSidebarFolder is unavailable.");
  assert(typeof context.assignSidebarConversation === "function", "assignSidebarConversation is unavailable.");

  const initial = await context.getSidebarFolderState();
  assert(initial.ok, "Initial state request failed.");
  assert(initial.state.ui.sectionExpanded === true, "Section should start expanded.");
  assert(initial.state.folders.length === 0, "Initial folder list should be empty.");

  const created = await context.createSidebarFolder(" Research ");
  assert(created.ok, "Folder creation failed.");
  assert(created.state.folders.length === 1, "Expected one folder after creation.");
  const folderId = created.state.folders[0].id;
  assert(created.state.folders[0].name === "Research", "Folder name was not normalized.");

  const renamed = await context.renameSidebarFolder(folderId, "Work Notes");
  assert(renamed.ok, "Folder rename failed.");
  assert(renamed.state.folders[0].name === "Work Notes", "Folder rename did not persist.");

  const assigned = await context.assignSidebarConversation({
    conversationId: "abc-123",
    folderId,
    title: "DOM tree analysis",
    url: "https://chatgpt.com/c/abc-123"
  });
  assert(assigned.ok, "Conversation assignment failed.");
  assert(
    assigned.state.assignments["abc-123"]?.folderId === folderId,
    "Conversation folder assignment missing."
  );

  const collapsedFolder = await context.setSidebarFolderExpanded(folderId, false);
  assert(collapsedFolder.ok, "Folder collapse failed.");
  assert(
    collapsedFolder.state.folders[0].expanded === false,
    "Folder expanded state did not persist."
  );

  const collapsedSection = await context.setSidebarSectionExpanded(false);
  assert(collapsedSection.ok, "Section collapse failed.");
  assert(
    collapsedSection.state.ui.sectionExpanded === false,
    "Section expanded state did not persist."
  );

  const cleared = await context.clearSidebarConversation("abc-123");
  assert(cleared.ok, "Conversation clear failed.");
  assert(!cleared.state.assignments["abc-123"], "Conversation assignment should be removed.");

  const deleted = await context.deleteSidebarFolder(folderId);
  assert(deleted.ok, "Folder delete failed.");
  assert(deleted.state.folders.length === 0, "Folder delete should remove folder.");

  const report = {
    endedAt: new Date().toISOString(),
    result: "passed",
    finalState: deleted.state
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  console.log("[PASS] Folder store self-test passed.");
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

  console.error("[FAIL] Folder store self-test failed.");
  console.error(error?.stack || error);
  process.exitCode = 1;
});
