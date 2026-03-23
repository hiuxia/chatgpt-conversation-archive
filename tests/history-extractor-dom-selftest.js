const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const MODULES = [
  path.join(PROJECT_ROOT, "extension", "content", "runtime.js"),
  path.join(PROJECT_ROOT, "extension", "content", "markdown-serializer.js"),
  path.join(PROJECT_ROOT, "extension", "content", "history-extractor.js")
];
const REPORT_PATH = path.join(__dirname, "reports", "history-extractor-dom-selftest-report.json");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadModules(context) {
  vm.createContext(context);
  for (const filePath of MODULES) {
    const source = fs.readFileSync(filePath, "utf8");
    vm.runInContext(source, context, { filename: filePath });
  }
}

function run() {
  const dom = new JSDOM(
    `
      <main>
        <section data-testid="conversation-turn-1" data-turn="user" data-turn-id="turn-user-1">
          <div data-message-author-role="user">How should we export multi-block assistant answers?</div>
        </section>
        <section data-testid="conversation-turn-2" data-turn="assistant" data-turn-id="turn-assistant-1">
          <div class="turn-reasoning"><button type="button">Thought for 42s</button></div>
          <div data-message-author-role="assistant">
            <div class="markdown prose">
              <p>First markdown block.</p>
            </div>
            <div class="markdown prose">
              <h2>Second block heading</h2>
              <p>Second markdown block.</p>
            </div>
          </div>
        </section>
      </main>
    `,
    { url: "https://chatgpt.com/c/abc123ef-1111-2222-3333-444444444444" }
  );

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
    console,
    setTimeout,
    clearTimeout
  };
  context.globalThis = context;

  loadModules(context);

  const ns = context.__chatgptConversationArchiveContent;
  const turnNodes = ns.getTurnNodesInOrder();
  assert(turnNodes.length === 2, "Section-based turn containers should be discovered in order.");
  assert(
    turnNodes[0].getAttribute("data-testid") === "conversation-turn-1" &&
      turnNodes[1].getAttribute("data-testid") === "conversation-turn-2",
    "Turn discovery should preserve section order."
  );

  const payload = ns.extractCurrentConversation();
  assert(payload.turns.length === 2, "Conversation extraction should keep both turns.");
  assert(payload.turns[0].role === "user", "First extracted turn should keep the user role.");
  assert(payload.turns[1].role === "assistant", "Second extracted turn should keep the assistant role.");
  assert(
    payload.turns[1].markdown.includes("First markdown block.") &&
      payload.turns[1].markdown.includes("## Second block heading") &&
      payload.turns[1].markdown.includes("Second markdown block."),
    "Assistant markdown should concatenate every markdown block inside a section-based turn."
  );
  assert(
    !payload.turns[1].markdown.includes("Thought for 42s"),
    "Thought toggle labels should not pollute exported markdown."
  );

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        turnCount: payload.turns.length,
        assistantMarkdown: payload.turns[1].markdown
      },
      null,
      2
    )
  );

  console.log("[PASS] History extractor DOM self-test passed.");
}

try {
  run();
} catch (error) {
  console.error("[FAIL] History extractor DOM self-test failed.");
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
}
