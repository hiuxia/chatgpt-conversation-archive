const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execSync } = require("child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const BACKGROUND_PATH = path.join(PROJECT_ROOT, "extension", "background.js");
const REPORT_PATH = path.join(__dirname, "reports", "zip-archive-selftest-report.json");
const ZIP_OUT_PATH = "/tmp/chatgpt-archive-selftest.zip";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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

function run() {
  const source = fs.readFileSync(BACKGROUND_PATH, "utf8");
  const context = buildContext();
  vm.createContext(context);
  vm.runInContext(source, context);

  assert(typeof context.createZipArchive === "function", "createZipArchive is unavailable.");

  const encoder = new TextEncoder();
  const zipBytes = context.createZipArchive([
    { name: "sample/a.md", data: encoder.encode("# A\\nhello\\n") },
    { name: "sample/b.md", data: encoder.encode("# B\\nworld\\n") }
  ]);

  fs.writeFileSync(ZIP_OUT_PATH, Buffer.from(zipBytes));
  const unzipTestOutput = execSync(`unzip -t ${ZIP_OUT_PATH}`).toString();

  assert(/No errors detected/i.test(unzipTestOutput), "Generated zip failed integrity check.");
  assert(/sample\/a\.md\s+OK/i.test(unzipTestOutput), "File sample/a.md not found in zip test.");
  assert(/sample\/b\.md\s+OK/i.test(unzipTestOutput), "File sample/b.md not found in zip test.");

  const report = {
    endedAt: new Date().toISOString(),
    result: "passed",
    zipPath: ZIP_OUT_PATH,
    unzipTestOutput: unzipTestOutput.trim()
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  console.log("[PASS] ZIP archive self-test passed.");
  console.log(`Report: ${REPORT_PATH}`);
}

try {
  run();
} catch (error) {
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
  console.error("[FAIL] ZIP archive self-test failed.");
  console.error(error?.stack || error);
  process.exitCode = 1;
}
