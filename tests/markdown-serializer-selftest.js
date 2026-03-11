const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const REPORT_PATH = path.join(__dirname, "reports", "markdown-serializer-selftest-report.json");
const MODULES = [
  path.join(PROJECT_ROOT, "extension", "content", "runtime.js"),
  path.join(PROJECT_ROOT, "extension", "content", "markdown-serializer.js")
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createContext(dom) {
  const context = {
    window: dom.window,
    document: dom.window.document,
    Node: dom.window.Node,
    Element: dom.window.Element,
    MutationObserver: dom.window.MutationObserver,
    CSS: dom.window.CSS,
    console,
    setTimeout,
    clearTimeout
  };
  context.globalThis = context;
  return context;
}

function loadModules(context) {
  vm.createContext(context);
  for (const filePath of MODULES) {
    const source = fs.readFileSync(filePath, "utf8");
    vm.runInContext(source, context);
  }
}

function run() {
  const dom = new JSDOM(`
    <article id="root">
      <h2>Heading</h2>
      <p><strong>Bold</strong> and <a href="https://example.com">link</a></p>
      <ul><li>First</li><li>Second</li></ul>
      <pre><code class="language-js">const x = 1;</code></pre>
      <table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>
    </article>
  `);

  const context = createContext(dom);
  loadModules(context);

  const markdown = context.__chatgptConversationArchiveContent.domToMarkdown(
    dom.window.document.getElementById("root")
  );

  assert(markdown.includes("## Heading"), "Heading was not serialized.");
  assert(markdown.includes("**Bold**"), "Bold text was not serialized.");
  assert(markdown.includes("[link](https://example.com)"), "Link was not serialized.");
  assert(markdown.includes("- First"), "List was not serialized.");
  assert(markdown.includes("```js"), "Code block language was not serialized.");
  assert(markdown.includes("| A | B |"), "Table was not serialized.");

  const report = {
    endedAt: new Date().toISOString(),
    result: "passed",
    markdown
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  console.log("[PASS] Markdown serializer self-test passed.");
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
  console.error("[FAIL] Markdown serializer self-test failed.");
  console.error(error?.stack || error);
  process.exitCode = 1;
}
