const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const REPORT_PATH = path.join(__dirname, "reports", "conversation-toc-dom-selftest-report.json");
const MODULES = [
  path.join(PROJECT_ROOT, "extension", "content", "runtime.js"),
  path.join(PROJECT_ROOT, "extension", "content", "conversation-toc.js")
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
      <main>
        <article data-testid="conversation-turn-1" data-scroll-anchor="false">
          <div data-message-author-role="user">Question one with a much longer prefix than we want to keep inside the TOC title preview.</div>
        </article>
        <article data-testid="conversation-turn-2" data-scroll-anchor="false">
          <div data-message-author-role="assistant">
            <div class="markdown prose">
              <h3>Earlier answer</h3>
              <p>intro</p>
            </div>
          </div>
        </article>
        <article data-testid="conversation-turn-3" data-scroll-anchor="false">
          <div data-message-author-role="user">Question two about methodology sections and how to structure the writeup cleanly for the paper.</div>
        </article>
        <article data-testid="conversation-turn-4" data-scroll-anchor="true">
          <div data-message-author-role="assistant">
            <div class="markdown prose">
              <h2>Current section</h2>
              <p>body</p>
              <h3>Sub point</h3>
              <p>more body</p>
            </div>
          </div>
        </article>
        <article data-testid="conversation-turn-5" data-scroll-anchor="false">
          <div data-message-author-role="assistant">
            <div class="markdown prose">
              <p>No headings here</p>
            </div>
          </div>
        </article>
      </main>
    `,
    { url: "https://chatgpt.com/c/abc123ef-1111-2222-3333-444444444444" }
  );

  let lastScrolledTarget = null;
  for (const element of dom.window.document.querySelectorAll("article, h1, h2, h3, h4, h5, h6")) {
    element.scrollIntoView = () => {
      lastScrolledTarget = element;
    };
  }

  class IntersectionObserverStub {
    constructor(callback) {
      this.callback = callback;
      this.elements = new Set();
      IntersectionObserverStub.instances.push(this);
    }
    observe(element) {
      this.elements.add(element);
    }
    disconnect() {
      this.elements.clear();
    }
  }
  IntersectionObserverStub.instances = [];

  const context = {
    window: dom.window,
    document: dom.window.document,
    Node: dom.window.Node,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver,
    IntersectionObserver: IntersectionObserverStub,
    URL: dom.window.URL,
    CSS: {
      ...(dom.window.CSS || {}),
      escape: (value) => String(value).replace(/["\\]/g, "\\$&")
    },
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    cancelAnimationFrame: (id) => clearTimeout(id)
  };
  context.globalThis = context;

  loadModules(context);

  const ns = context.__chatgptConversationArchiveContent;
  const controller = ns.createConversationTocController();
  controller.start();
  await wait(10);

  const rail = dom.window.document.querySelector(".cgca-conversation-toc-rail");
  assert(rail, "Conversation TOC rail should render on conversation pages.");

  const pill = rail.querySelector(".cgca-conversation-toc-pill");
  assert(pill, "Conversation TOC should render a toggle pill.");
  assert(pill.textContent === "TOC", "Conversation TOC pill should use the English label.");
  assert(
    rail.querySelectorAll(".cgca-conversation-toc-dot").length === 0,
    "TOC should start collapsed and hide jump dots until expanded."
  );

  pill.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await wait(0);

  const dots = rail.querySelectorAll(".cgca-conversation-toc-dot");
  assert(dots.length === 3, "Every assistant answer should produce one jump dot.");

  const surface = rail.querySelector(".cgca-conversation-toc-surface");
  assert(surface, "Expanded TOC should render a dock surface.");

  const dotsViewport = rail.querySelector(".cgca-conversation-toc-dots-viewport");
  assert(dotsViewport, "Expanded TOC should wrap jump dots in a scrollable viewport.");

  const activeDot = rail.querySelector(".cgca-conversation-toc-dot.is-active");
  assert(activeDot, "Current assistant answer should mark one dot as active.");
  assert(
    activeDot.getAttribute("data-turn-id") === "conversation-turn-4",
    "Active dot should follow the scroll-anchor assistant answer."
  );

  const miniOutlineItems = rail.querySelectorAll(".cgca-conversation-toc-outline-item");
  assert(miniOutlineItems.length === 2, "Active answer outline should include assistant markdown headings.");
  assert(
    !Array.from(miniOutlineItems).some((item) => item.textContent.includes("Earlier answer")),
    "Mini outline should only include headings from the active answer."
  );
  const cardTitle = rail.querySelector(".cgca-conversation-toc-card-title");
  assert(cardTitle, "Expanded TOC should render a compact title card.");
  assert(
    rail.querySelector(".cgca-conversation-toc-card-eyebrow")?.textContent === "Current answer",
    "TOC card eyebrow should use the English label."
  );
  assert(
    cardTitle.textContent.startsWith("Question two about method"),
    "TOC title should be derived from the previous user message."
  );
  assert(
    cardTitle.textContent.endsWith("..."),
    "Long user titles should be truncated to a short readable prefix."
  );
  assert(
    !rail.textContent.includes("assistant markdown"),
    "TOC card should avoid noisy implementation detail text."
  );

  const styleTag = dom.window.document.getElementById("cgca-conversation-toc-styles");
  assert(styleTag, "TOC should inject its styles.");
  assert(
    styleTag.textContent.includes(".cgca-conversation-toc-surface"),
    "TOC styles should define the dock surface layout."
  );
  assert(
    styleTag.textContent.includes(".cgca-conversation-toc-dots-viewport"),
    "TOC styles should define a scrollable dots viewport."
  );
  assert(
    styleTag.textContent.includes("overflow-y: auto"),
    "TOC styles should allow overflow scrolling for long outlines."
  );

  dots[0].dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await wait(0);
  assert(!lastScrolledTarget, "Clicking a dot should preview the answer instead of jumping immediately.");
  assert(
    rail.querySelector(".cgca-conversation-toc-card-title")?.textContent.startsWith("Question one with a much"),
    "Clicking a dot should switch the preview card to that answer."
  );

  const previewJumpButton = rail.querySelector(".cgca-conversation-toc-card-action-button");
  assert(previewJumpButton, "Preview card should render an explicit jump action.");
  assert(
    previewJumpButton.textContent === "Jump here",
    "Preview jump action should use the English label."
  );
  previewJumpButton.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  assert(
    lastScrolledTarget?.getAttribute("data-testid") === "conversation-turn-2",
    "Explicit jump action should scroll to the previewed assistant answer."
  );

  const previewOutlineItems = rail.querySelectorAll(".cgca-conversation-toc-outline-item");
  assert(previewOutlineItems.length === 1, "Preview should refresh the outline for the selected answer.");
  previewOutlineItems[0].dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  assert(lastScrolledTarget?.tagName === "H3", "Clicking a preview outline item should scroll to its heading.");

  const observer = IntersectionObserverStub.instances[0];
  const laterArticle = dom.window.document.querySelector('[data-testid="conversation-turn-5"]');
  observer.callback([
    {
      target: laterArticle,
      isIntersecting: true,
      intersectionRatio: 0.8
    }
  ]);
  await wait(0);

  const refreshedActiveDot = rail.querySelector(".cgca-conversation-toc-dot.is-active");
  assert(
    refreshedActiveDot?.getAttribute("data-turn-id") === "conversation-turn-2",
    "Visible turn updates should not override an answer the user is actively previewing."
  );

  dom.window.document.body.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true }));
  await wait(0);
  assert(
    rail.querySelectorAll(".cgca-conversation-toc-dot").length === 0,
    "Clicking outside the rail should collapse the TOC."
  );

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        dots: dots.length,
        outlineItems: miniOutlineItems.length,
        activeDot: refreshedActiveDot?.getAttribute("data-turn-id") || null
      },
      null,
      2
    )
  );

  console.log("[PASS] Conversation TOC DOM self-test passed.");
}

run().catch((error) => {
  console.error("[FAIL] Conversation TOC DOM self-test failed.");
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
