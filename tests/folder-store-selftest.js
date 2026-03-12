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
  assert(typeof context.moveSidebarFolder === "function", "moveSidebarFolder is unavailable.");
  assert(
    typeof context.upsertSidebarConversationCatalog === "function",
    "upsertSidebarConversationCatalog is unavailable."
  );

  await context.chrome.storage.local.set({
    "sidebarFolders.v1": {
      schemaVersion: 1,
      folders: [
        {
          id: "legacy_root",
          name: "Legacy Root",
          order: 0,
          expanded: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      assignments: {},
      ui: {
        sectionExpanded: true
      }
    }
  });

  const initial = await context.getSidebarFolderState();
  assert(initial.ok, "Initial state request failed.");
  assert(initial.state.ui.sectionExpanded === true, "Section should start expanded.");
  assert(initial.state.folders.length === 1, "Legacy state should be migrated instead of dropped.");
  assert(
    initial.state.folders[0].parentFolderId === null,
    "Legacy folders should migrate to root-level parentFolderId."
  );

  const created = await context.createSidebarFolder(" Research ");
  assert(created.ok, "Folder creation failed.");
  assert(created.state.folders.length === 2, "Expected one additional folder after creation.");
  const folderId = created.state.folders.find((item) => item.name === "Research")?.id;
  assert(folderId, "Created root folder id missing.");
  assert(
    created.state.folders.find((item) => item.id === folderId)?.name === "Research",
    "Folder name was not normalized."
  );
  assert(
    created.state.folders.find((item) => item.id === folderId)?.parentFolderId === null,
    "Root folder should default to parentFolderId null."
  );

  const childCreated = await context.createSidebarFolder(" Sub Research ", folderId);
  assert(childCreated.ok, "Child folder creation failed.");
  const childFolder = childCreated.state.folders.find((item) => item.name === "Sub Research");
  assert(childFolder, "Expected a child folder after nested creation.");
  assert(childFolder.parentFolderId === folderId, "Child folder parentFolderId did not persist.");

  const renamed = await context.renameSidebarFolder(folderId, "Work Notes");
  assert(renamed.ok, "Folder rename failed.");
  assert(
    renamed.state.folders.find((item) => item.id === folderId)?.name === "Work Notes",
    "Folder rename did not persist."
  );

  const movedChild = await context.moveSidebarFolder(childFolder.id, null);
  assert(movedChild.ok, "Moving child folder to root failed.");
  assert(
    movedChild.state.folders.find((item) => item.id === childFolder.id)?.parentFolderId === null,
    "Moving folder to root should clear parentFolderId."
  );

  const reparentedChild = await context.moveSidebarFolder(childFolder.id, folderId);
  assert(reparentedChild.ok, "Moving child folder back under parent failed.");
  assert(
    reparentedChild.state.folders.find((item) => item.id === childFolder.id)?.parentFolderId ===
      folderId,
    "Moving folder under another folder should update parentFolderId."
  );

  const cycleAttempt = await context.moveSidebarFolder(folderId, childFolder.id);
  assert(!cycleAttempt.ok, "Moving a folder into its descendant should be rejected.");

  const assigned = await context.assignSidebarConversation({
    conversationId: "abc-123",
    folderId: childFolder.id,
    title: "DOM tree analysis",
    url: "https://chatgpt.com/c/abc-123"
  });
  assert(assigned.ok, "Conversation assignment failed.");
  assert(
    assigned.state.assignments["abc-123"]?.folderId === childFolder.id,
    "Conversation folder assignment missing."
  );
  assert(
    assigned.state.conversationCatalog["abc-123"]?.title === "DOM tree analysis",
    "Conversation assignment should also seed the local conversation catalog."
  );

  const collapsedFolder = await context.setSidebarFolderExpanded(folderId, false);
  assert(collapsedFolder.ok, "Folder collapse failed.");
  assert(
    collapsedFolder.state.folders.find((item) => item.id === folderId)?.expanded === false,
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

  const reassigned = await context.assignSidebarConversation({
    conversationId: "abc-123",
    folderId: childFolder.id,
    title: "DOM tree analysis",
    url: "https://chatgpt.com/c/abc-123"
  });
  assert(reassigned.ok, "Conversation reassignment failed.");

  const catalogUpserted = await context.upsertSidebarConversationCatalog(
    [
      {
        id: "offline-456",
        title: "Offline cached chat",
        url: "https://chatgpt.com/c/offline-456"
      }
    ],
    "history"
  );
  assert(catalogUpserted.ok, "Conversation catalog upsert failed.");
  assert(
    catalogUpserted.state.conversationCatalog["offline-456"]?.url ===
      "https://chatgpt.com/c/offline-456",
    "Conversation catalog should persist independently of assignments."
  );

  const deleted = await context.deleteSidebarFolder(folderId);
  assert(deleted.ok, "Folder delete failed.");
  assert(
    !deleted.state.folders.some((item) => item.id === folderId),
    "Folder delete should remove the target folder."
  );
  assert(
    deleted.state.folders.find((item) => item.id === childFolder.id)?.parentFolderId === null,
    "Deleting a folder should promote child folders to the root."
  );
  assert(
    deleted.state.assignments["abc-123"]?.folderId === childFolder.id,
    "Deleting a parent folder should preserve assignments inside promoted child folders."
  );

  await context.chrome.storage.local.set({
    "sidebarFolders.v1": {
      schemaVersion: 2,
      folders: [
        {
          id: "cyc_a",
          name: "Cycle A",
          parentFolderId: "cyc_b",
          order: 0,
          expanded: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: "cyc_b",
          name: "Cycle B",
          parentFolderId: "cyc_a",
          order: 0,
          expanded: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: "orphan",
          name: "Orphan",
          parentFolderId: "missing_parent",
          order: 0,
          expanded: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      assignments: {},
      conversationCatalog: {
        seeded_from_store: {
          id: "seeded_from_store",
          title: "Seeded chat",
          url: "https://chatgpt.com/c/seeded_from_store",
          lastSeenAt: new Date().toISOString(),
          lastSeenSource: "history"
        }
      },
      ui: {
        sectionExpanded: true
      }
    }
  });

  const normalizedInvalidState = await context.getSidebarFolderState();
  assert(normalizedInvalidState.ok, "Reloading invalid tree state failed.");
  assert(
    normalizedInvalidState.state.folders.every((folder) => folder.parentFolderId === null),
    "Invalid or cyclic parentFolderId values should be normalized back to root."
  );
  assert(
    normalizedInvalidState.state.conversationCatalog.seeded_from_store?.title === "Seeded chat",
    "Stored conversation catalog entries should survive normalization."
  );

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
