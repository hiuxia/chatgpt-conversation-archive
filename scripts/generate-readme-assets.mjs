import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(PROJECT_ROOT, "assets", "readme");
const EXTENSION_DIR = path.join(PROJECT_ROOT, "extension");
const CHROME_PATH =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const SCRIPT_PATHS = {
  runtime: path.join(EXTENSION_DIR, "content", "runtime.js"),
  toc: path.join(EXTENSION_DIR, "content", "conversation-toc.js"),
  folders: path.join(EXTENSION_DIR, "content", "sidebar-folders.js")
};

const folderState = {
  schemaVersion: 3,
  folders: [
    {
      id: "work",
      name: "Work",
      parentFolderId: null,
      order: 0,
      expanded: true
    },
    {
      id: "research",
      name: "Research",
      parentFolderId: "work",
      order: 0,
      expanded: true
    },
    {
      id: "writing",
      name: "Writing",
      parentFolderId: null,
      order: 1,
      expanded: true
    }
  ],
  assignments: {
    "api-debugging": {
      folderId: "work",
      title: "API debugging session",
      url: "https://chatgpt.com/c/api-debugging",
      updatedAt: "2026-04-24T00:00:00.000Z"
    },
    "literature-map": {
      folderId: "research",
      title: "Literature map",
      url: "https://chatgpt.com/c/literature-map",
      updatedAt: "2026-04-24T00:00:00.000Z"
    },
    "draft-outline": {
      folderId: "writing",
      title: "Draft outline",
      url: "https://chatgpt.com/c/draft-outline",
      updatedAt: "2026-04-24T00:00:00.000Z"
    }
  },
  conversationCatalog: {
    "api-debugging": {
      id: "api-debugging",
      title: "API debugging session",
      url: "https://chatgpt.com/c/api-debugging",
      lastSeenAt: "2026-04-24T00:00:00.000Z"
    },
    "literature-map": {
      id: "literature-map",
      title: "Literature map",
      url: "https://chatgpt.com/c/literature-map",
      lastSeenAt: "2026-04-24T00:00:00.000Z"
    },
    "draft-outline": {
      id: "draft-outline",
      title: "Draft outline",
      url: "https://chatgpt.com/c/draft-outline",
      lastSeenAt: "2026-04-24T00:00:00.000Z"
    }
  },
  ui: {
    sectionExpanded: true
  }
};

const historyItems = [
  {
    id: "api-debugging",
    title: "API debugging session",
    url: "https://chatgpt.com/c/api-debugging"
  },
  {
    id: "literature-map",
    title: "Literature map",
    url: "https://chatgpt.com/c/literature-map"
  },
  {
    id: "draft-outline",
    title: "Draft outline",
    url: "https://chatgpt.com/c/draft-outline"
  },
  {
    id: "weekly-review",
    title: "Weekly review notes",
    url: "https://chatgpt.com/c/weekly-review"
  },
  {
    id: "release-plan",
    title: "Release plan",
    url: "https://chatgpt.com/c/release-plan"
  }
];

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    await captureInstallFlow(browser);
    await captureContentFeature(browser, {
      filename: "overview.png",
      mode: "overview"
    });
    await captureContentFeature(browser, {
      filename: "sidebar-folders.png",
      mode: "folders"
    });
    await captureContentFeature(browser, {
      filename: "conversation-toc.png",
      mode: "toc"
    });
    await captureSidepanel(browser);
  } finally {
    await browser.close();
  }

  console.log(`[readme-assets] wrote assets to ${OUT_DIR}`);
}

async function captureInstallFlow(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.setContent(buildInstallFlowHtml(), { waitUntil: "domcontentloaded" });
  await screenshotElement(page, ".readme-shot", "install-flow.png");
  await page.close();
}

async function captureContentFeature(browser, { filename, mode }) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await serveFixturePage(page, buildConversationFixtureHtml({ mode }));
  await page.goto("https://chatgpt.com/c/readme-fixture", {
    waitUntil: "domcontentloaded"
  });

  await installChromeStub(page);
  await page.addScriptTag({ path: SCRIPT_PATHS.runtime });

  if (mode === "overview" || mode === "folders") {
    await page.addScriptTag({ path: SCRIPT_PATHS.folders });
    await page.evaluate(() => {
      const ns = globalThis.__chatgptConversationArchiveContent;
      const controller = ns.createSidebarFolderController();
      globalThis.__readmeSidebarController = controller;
      controller.start();
    });
    await page.waitForSelector(".cgca-folder-section", { timeout: 5000 });
  }

  if (mode === "overview" || mode === "toc") {
    await page.addScriptTag({ path: SCRIPT_PATHS.toc });
    await page.evaluate(() => {
      const ns = globalThis.__chatgptConversationArchiveContent;
      const controller = ns.createConversationTocController();
      globalThis.__readmeTocController = controller;
      controller.start();
    });
    await page.waitForSelector(".cgca-conversation-toc-rail", { timeout: 5000 });
    await page.click(".cgca-conversation-toc-pill");
    await page.waitForSelector(".cgca-conversation-toc-surface", { timeout: 5000 });
  }

  await page.evaluate(() => document.fonts?.ready);
  await sleep(250);
  await page.screenshot({
    path: path.join(OUT_DIR, filename),
    fullPage: false
  });
  await page.close();
}

async function captureSidepanel(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 860, deviceScaleFactor: 1 });
  const css = await fs.readFile(path.join(EXTENSION_DIR, "sidepanel.css"), "utf8");
  await page.setContent(buildSidepanelFixtureHtml(css), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".history-item", { timeout: 5000 });
  await page.evaluate(() => document.fonts?.ready);
  await sleep(100);
  await screenshotElement(page, ".app", "export-sidepanel.png");
  await page.close();
}

async function serveFixturePage(page, html) {
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (request.isNavigationRequest()) {
      request.respond({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: html
      });
      return;
    }
    request.abort();
  });
}

async function installChromeStub(page) {
  await page.evaluate((state) => {
    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener() {}
        },
        async sendMessage(message) {
          if (
            message?.type === "GET_SIDEBAR_FOLDER_STATE" ||
            message?.type === "UPSERT_SIDEBAR_CONVERSATIONS"
          ) {
            return { ok: true, state };
          }
          return { ok: true };
        }
      }
    };
  }, folderState);
}

async function screenshotElement(page, selector, filename) {
  await page.waitForSelector(selector, { timeout: 5000 });
  const element = await page.$(selector);
  if (!element) {
    throw new Error(`Could not find screenshot element: ${selector}`);
  }
  await element.screenshot({ path: path.join(OUT_DIR, filename) });
}

function buildInstallFlowHtml() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      ${baseFixtureCss()}
      body { background: #f6f7f9; }
      .readme-shot {
        width: 1180px;
        margin: 38px auto;
        padding: 28px;
        border: 1px solid #e5e7eb;
        border-radius: 18px;
        background: #fff;
        box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
      }
      .install-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 16px;
      }
      .install-step {
        min-height: 310px;
        border: 1px solid #e5e7eb;
        border-radius: 14px;
        background: #f9fafb;
        padding: 18px;
        display: grid;
        grid-template-rows: auto 1fr auto;
        gap: 14px;
      }
      .step-head {
        display: flex;
        align-items: center;
        gap: 10px;
        color: #111827;
        font-size: 16px;
        font-weight: 700;
      }
      .num {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 999px;
        background: #0f766e;
        color: #fff;
        font-size: 14px;
      }
      .mini-ui {
        border: 1px solid #d1d5db;
        border-radius: 12px;
        background: #fff;
        padding: 14px;
        display: grid;
        gap: 12px;
        align-content: start;
      }
      .bar { height: 12px; border-radius: 999px; background: #e5e7eb; }
      .bar.short { width: 60%; }
      .bar.mid { width: 78%; }
      .toggle {
        width: 58px;
        height: 30px;
        border-radius: 999px;
        background: #0f766e;
        justify-self: end;
        padding: 3px;
        box-sizing: border-box;
      }
      .toggle::after {
        content: "";
        display: block;
        width: 24px;
        height: 24px;
        margin-left: auto;
        border-radius: 999px;
        background: #fff;
      }
      .button-shape {
        min-height: 42px;
        border-radius: 10px;
        border: 2px solid #0f766e;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #0f766e;
        font-weight: 700;
      }
      .folder-shape {
        width: 120px;
        height: 86px;
        border-radius: 8px 12px 12px;
        background: #ccfbf1;
        border: 2px solid #0f766e;
        position: relative;
        margin: 26px auto 12px;
      }
      .folder-shape::before {
        content: "";
        position: absolute;
        top: -16px;
        left: -2px;
        width: 54px;
        height: 18px;
        border-radius: 8px 8px 0 0;
        background: #ccfbf1;
        border: 2px solid #0f766e;
        border-bottom: 0;
      }
      .refresh-arrow {
        margin: 32px auto 10px;
        width: 92px;
        height: 92px;
        border: 10px solid #0f766e;
        border-left-color: transparent;
        border-radius: 999px;
        position: relative;
      }
      .refresh-arrow::after {
        content: "";
        position: absolute;
        right: -3px;
        top: 6px;
        border: 13px solid transparent;
        border-left-color: #0f766e;
        transform: rotate(-24deg);
      }
      .caption {
        margin: 0;
        color: #4b5563;
        font-size: 13px;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <div class="readme-shot">
      <div class="install-grid">
        <section class="install-step">
          <div class="step-head"><span class="num">1</span><span>Open extensions</span></div>
          <div class="mini-ui">
            <div class="bar mid"></div>
            <div class="bar"></div>
            <div class="bar short"></div>
          </div>
          <p class="caption">Go to chrome://extensions.</p>
        </section>
        <section class="install-step">
          <div class="step-head"><span class="num">2</span><span>Enable developer mode</span></div>
          <div class="mini-ui">
            <div class="bar short"></div>
            <div class="toggle"></div>
            <div class="bar"></div>
          </div>
          <p class="caption">Turn on Developer mode.</p>
        </section>
        <section class="install-step">
          <div class="step-head"><span class="num">3</span><span>Load unpacked</span></div>
          <div class="mini-ui">
            <div class="button-shape">Load unpacked</div>
            <div class="folder-shape"></div>
          </div>
          <p class="caption">Choose the repository's extension/ folder.</p>
        </section>
        <section class="install-step">
          <div class="step-head"><span class="num">4</span><span>Refresh ChatGPT</span></div>
          <div class="mini-ui">
            <div class="refresh-arrow"></div>
            <div class="bar mid"></div>
          </div>
          <p class="caption">Reload chatgpt.com and check the sidebar.</p>
        </section>
      </div>
    </div>
  </body>
</html>`;
}

function buildConversationFixtureHtml({ mode }) {
  const sidebarHidden = mode === "toc" ? " sidebar-quiet" : "";
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      ${baseFixtureCss()}
      body {
        margin: 0;
        background: #f6f7f9;
        color: #111827;
      }
      .browser-shell {
        width: 1360px;
        height: 820px;
        margin: 40px auto;
        border: 1px solid #e5e7eb;
        border-radius: 18px;
        overflow: hidden;
        background: #fff;
        box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
        display: grid;
        grid-template-columns: 320px minmax(0, 1fr);
      }
      nav {
        background: #f7f7f8;
        border-right: 1px solid #e5e7eb;
        padding: 14px 0;
        overflow: hidden;
      }
      nav button {
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
      }
      nav svg {
        flex: 0 0 auto;
      }
      .sidebar-quiet nav {
        opacity: 0.38;
      }
      .native-section {
        padding-top: 8px;
      }
      .native-label,
      .__menu-label {
        margin: 0;
        color: #6b7280;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      .native-label {
        padding: 0 16px 6px;
      }
      #history {
        display: grid;
        gap: 2px;
      }
      .__menu-item {
        display: flex;
        align-items: center;
        min-height: 36px;
        box-sizing: border-box;
        padding: 7px 14px;
        margin: 0 8px;
        width: calc(100% - 16px);
        border-radius: 10px;
        color: #111827;
        text-decoration: none;
        border: 0;
        background: transparent;
        font: inherit;
        font-size: 14px;
        text-align: left;
        cursor: pointer;
      }
      .hoverable:hover,
      .__menu-item:hover {
        background: rgba(0, 0, 0, 0.045);
      }
      .group { position: relative; }
      .flex { display: flex; }
      .inline-flex { display: inline-flex; }
      .w-full { width: 100%; }
      .text-token-text-tertiary { color: #6b7280; }
      .min-w-0 { min-width: 0; }
      .grow { flex-grow: 1; }
      .items-center { align-items: center; }
      .items-start { align-items: flex-start; }
      .justify-start { justify-content: flex-start; }
      .gap-0\\.5 { gap: 0.125rem; }
      .gap-1\\.5 { gap: 0.375rem; }
      .gap-2\\.5 { gap: 0.625rem; }
      .px-4 { padding-left: 1rem; padding-right: 1rem; }
      .py-1\\.5 { padding-top: 0.375rem; padding-bottom: 0.375rem; }
      .truncate {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      main {
        overflow: auto;
        background: #fff;
      }
      .conversation {
        max-width: 820px;
        margin: 0 auto;
        padding: 42px 64px 120px;
        display: grid;
        gap: 28px;
      }
      .turn {
        display: grid;
        gap: 10px;
      }
      .turn[data-turn="user"] {
        justify-items: end;
      }
      .bubble {
        max-width: 620px;
        border-radius: 18px;
        padding: 14px 16px;
        background: #f3f4f6;
        line-height: 1.55;
        font-size: 15px;
      }
      .assistant {
        max-width: 760px;
        line-height: 1.65;
        color: #1f2937;
        font-size: 15px;
      }
      .assistant h2,
      .assistant h3 {
        margin: 20px 0 8px;
        color: #111827;
        line-height: 1.25;
      }
      .assistant h2 {
        font-size: 22px;
      }
      .assistant h3 {
        font-size: 18px;
      }
      .assistant p {
        margin: 0 0 12px;
      }
      .assistant ul {
        margin: 0 0 12px 22px;
        padding: 0;
      }
    </style>
  </head>
  <body>
    <div class="browser-shell${sidebarHidden}">
      <nav aria-label="Chat history">
        <section class="native-section">
          <div class="native-label">Your chats</div>
          <div id="history">
            ${historyItems
              .map(
                (item) => `
            <a href="/c/${item.id}" data-sidebar-item="true" class="group __menu-item hoverable gap-1.5 w-full">
              <span class="truncate">${escapeHtml(item.title)}</span>
            </a>`
              )
              .join("")}
          </div>
        </section>
      </nav>
      <main>
        <div class="conversation">
          <section class="turn" data-testid="conversation-turn-1" data-turn="user" data-scroll-anchor="false">
            <div data-message-author-role="user" class="bubble">Can you turn these project notes into a cleaner implementation plan?</div>
          </section>
          <section class="turn" data-testid="conversation-turn-2" data-turn="assistant" data-scroll-anchor="true">
            <div data-message-author-role="assistant" class="markdown prose assistant">
              <h2>Implementation Plan</h2>
              <p>Start with the highest-risk surface, verify the current behavior, then make the smallest change that keeps the workflow stable.</p>
              <h3>1. Discovery</h3>
              <p>Read the extension entry points, content scripts, and tests before changing behavior.</p>
              <h3>2. Implementation</h3>
              <p>Keep the sidebar, table of contents, and export panel independent so one feature cannot block another.</p>
              <h3>3. Verification</h3>
              <ul>
                <li>Run the DOM self-tests.</li>
                <li>Check the README screenshots against the rendered UI.</li>
                <li>Document any browser setup requirements.</li>
              </ul>
            </div>
          </section>
          <section class="turn" data-testid="conversation-turn-3" data-turn="user" data-scroll-anchor="false">
            <div data-message-author-role="user" class="bubble">Now summarize the export workflow.</div>
          </section>
          <section class="turn" data-testid="conversation-turn-4" data-turn="assistant" data-scroll-anchor="false">
            <div data-message-author-role="assistant" class="markdown prose assistant">
              <h2>Export Workflow</h2>
              <p>Use the side panel to export the current conversation, or load history links and select multiple conversations for a ZIP archive.</p>
              <h3>Current chat</h3>
              <p>Open a conversation page, then export it directly to Markdown.</p>
              <h3>Batch export</h3>
              <p>Load visible history links, search or paginate the list, select items, and export them as one ZIP.</p>
            </div>
          </section>
        </div>
      </main>
    </div>
  </body>
</html>`;
}

function buildSidepanelFixtureHtml(css) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      ${css}
      body { width: 420px; }
    </style>
  </head>
  <body>
    <main class="app">
      <header class="header">
        <h1>ChatGPT Voyager</h1>
        <p>Export and organize ChatGPT chats</p>
      </header>

      <section class="actions">
        <button class="btn primary">Export Current Conversation</button>
        <button class="btn primary subtle">Export Selected (ZIP)</button>
        <button class="btn">Load History Links</button>
      </section>

      <section class="panel">
        <div class="panel-title-row">
          <h2>History</h2>
          <span>1-5/5 (all 5)</span>
        </div>
        <input class="search-input" type="search" value="" placeholder="Search history title..." />
        <div class="selection-row">
          <button class="btn tiny">Select Page</button>
          <button class="btn tiny">Clear Selection</button>
          <span class="selected-count">Selected: 2</span>
        </div>
        <div class="pagination-row">
          <button class="btn tiny" disabled>Prev</button>
          <span class="page-info">Page 1/1</span>
          <button class="btn tiny" disabled>Next</button>
          <label class="page-size-label">
            Page size
            <select class="page-size-select">
              <option selected>20</option>
            </select>
          </label>
        </div>
        <div class="history-list">
          ${historyItems
            .map((item, index) => {
              const checked = index === 0 || index === 2 ? " checked" : "";
              return `
          <article class="history-item">
            <div class="history-item-top">
              <input class="history-checkbox" type="checkbox"${checked} />
              <p class="history-item-title">${escapeHtml(item.title)}</p>
            </div>
            <p class="history-item-meta">${escapeHtml(item.id)}</p>
          </article>`;
            })
            .join("")}
        </div>
      </section>

      <section class="status-wrap">
        <h2>Status</h2>
        <pre class="status">Loaded 5 history entries.</pre>
      </section>
    </main>
  </body>
</html>`;
}

function baseFixtureCss() {
  return `
    :root {
      color-scheme: light;
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    }
    * { box-sizing: border-box; }
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
