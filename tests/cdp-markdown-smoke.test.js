const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const CONTENT_SCRIPT_PATH = path.join(PROJECT_ROOT, "extension", "content.js");
const REPORT_PATH = path.join(__dirname, "reports", "cdp-markdown-smoke-report.json");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const contentScriptSource = fs.readFileSync(CONTENT_SCRIPT_PATH, "utf8");
  const browser = await puppeteer.connect({
    browserURL: "http://127.0.0.1:9222",
    defaultViewport: null
  });

  const page = await browser.newPage();
  const report = {
    startedAt: new Date().toISOString(),
    steps: [],
    checks: [],
    result: "unknown"
  };

  try {
    report.steps.push("Navigate to chatgpt.com home");
    await page.goto("https://chatgpt.com/", { waitUntil: "networkidle2", timeout: 120000 });
    await sleep(2000);

    const firstConversationHref = await page.evaluate(
      () => document.querySelector('a[href^="/c/"]')?.getAttribute("href") || null
    );
    assert(firstConversationHref, "No conversation link found on home page.");
    report.steps.push(`Found first conversation href: ${firstConversationHref}`);

    const conversationUrl = new URL(firstConversationHref, "https://chatgpt.com").toString();
    report.steps.push(`Navigate to conversation: ${conversationUrl}`);
    await page.goto(conversationUrl, { waitUntil: "networkidle2", timeout: 120000 });
    await sleep(2500);

    const extractionResult = await page.evaluate(async (src) => {
      const originalChrome = globalThis.chrome;
      const fakeRuntime = {
        onMessage: {
          addListener(fn) {
            globalThis.__archive_listener = fn;
          }
        }
      };

      function markdownFeatureStats(markdownText) {
        const text = markdownText || "";
        return {
          hasHeading: /(^|\n)#{1,6}\s/m.test(text),
          hasList: /(^|\n)\s*(?:- |\d+\. )/m.test(text),
          hasBold: /\*\*[^*]+\*\*/.test(text),
          hasLink: /\[[^\]]+\]\([^)]+\)/.test(text),
          hasCode: /```[\s\S]*?```|`[^`]+`/.test(text),
          hasTable: /(^|\n)\|.+\|/m.test(text)
        };
      }

      try {
        if (!globalThis.chrome) {
          globalThis.chrome = { runtime: fakeRuntime };
        } else {
          globalThis.chrome.runtime = fakeRuntime;
        }

        eval(src);

        if (typeof globalThis.__archive_listener !== "function") {
          return { ok: false, error: "content.js listener was not registered" };
        }

        const response = await new Promise((resolve) => {
          globalThis.__archive_listener(
            { type: "EXTRACT_CURRENT_CONVERSATION" },
            {},
            (payload) => resolve(payload)
          );
        });

        const turns = response?.data?.turns || [];
        const firstAssistantTurn = turns.find((t) => t.role === "assistant");
        const markdown = firstAssistantTurn?.markdown || firstAssistantTurn?.text || "";

        const domAssistantMarkdownNode = document.querySelector(
          '[data-message-author-role="assistant"] .markdown.prose, [data-message-author-role="assistant"] .markdown, [data-message-author-role="assistant"] [class*="markdown"]'
        );

        const domFeatures = domAssistantMarkdownNode
          ? {
              headings: domAssistantMarkdownNode.querySelectorAll("h1,h2,h3,h4,h5,h6").length,
              lists: domAssistantMarkdownNode.querySelectorAll("ul,ol").length,
              bold: domAssistantMarkdownNode.querySelectorAll("strong,b").length,
              links: domAssistantMarkdownNode.querySelectorAll("a[href]").length,
              code: domAssistantMarkdownNode.querySelectorAll("pre code, code").length,
              tables: domAssistantMarkdownNode.querySelectorAll("table").length
            }
          : null;

        return {
          ok: true,
          responseOk: response?.ok === true,
          turnCount: turns.length,
          firstAssistantMarkdown: markdown,
          markdownFeatures: markdownFeatureStats(markdown),
          domFeatures
        };
      } catch (error) {
        return {
          ok: false,
          error: error?.message || String(error)
        };
      } finally {
        if (originalChrome) {
          globalThis.chrome = originalChrome;
        }
        delete globalThis.__archive_listener;
      }
    }, contentScriptSource);

    assert(extractionResult.ok, `Extraction runtime failed: ${extractionResult.error || "unknown"}`);
    assert(extractionResult.responseOk, "EXTRACT_CURRENT_CONVERSATION response is not ok.");
    assert(extractionResult.turnCount > 0, "No turns extracted from conversation.");
    assert(
      extractionResult.firstAssistantMarkdown && extractionResult.firstAssistantMarkdown.length > 20,
      "Assistant markdown result is empty or too short."
    );

    const markdownFeatures = extractionResult.markdownFeatures;
    const domFeatures = extractionResult.domFeatures || {};

    if ((domFeatures.headings || 0) > 0) {
      assert(markdownFeatures.hasHeading, "DOM has headings but markdown output has no heading syntax.");
      report.checks.push("Heading syntax preserved.");
    }
    if ((domFeatures.lists || 0) > 0) {
      assert(markdownFeatures.hasList, "DOM has list but markdown output has no list syntax.");
      report.checks.push("List syntax preserved.");
    }
    if ((domFeatures.bold || 0) > 0) {
      assert(markdownFeatures.hasBold, "DOM has bold text but markdown output has no bold syntax.");
      report.checks.push("Bold syntax preserved.");
    }
    if ((domFeatures.links || 0) > 0) {
      assert(markdownFeatures.hasLink, "DOM has links but markdown output has no markdown links.");
      report.checks.push("Link syntax preserved.");
    }
    if ((domFeatures.code || 0) > 0) {
      assert(markdownFeatures.hasCode, "DOM has code block/inline code but markdown output has no code syntax.");
      report.checks.push("Code syntax preserved.");
    }
    if ((domFeatures.tables || 0) > 0) {
      assert(markdownFeatures.hasTable, "DOM has table but markdown output has no table syntax.");
      report.checks.push("Table syntax preserved.");
    }

    report.extraction = {
      turnCount: extractionResult.turnCount,
      domFeatures,
      markdownFeatures,
      sampleMarkdown: extractionResult.firstAssistantMarkdown.slice(0, 1200)
    };
    report.result = "passed";

    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
    console.log("[PASS] CDP markdown smoke test passed.");
    console.log(`Report: ${REPORT_PATH}`);
  } finally {
    await page.close();
    await browser.disconnect();
  }
}

run().catch((error) => {
  const failureReport = {
    endedAt: new Date().toISOString(),
    result: "failed",
    error: error?.message || String(error)
  };
  try {
    fs.writeFileSync(REPORT_PATH, JSON.stringify(failureReport, null, 2), "utf8");
  } catch (_) {
    // ignore report write failure
  }
  console.error("[FAIL] CDP markdown smoke test failed.");
  console.error(error?.stack || error);
  process.exitCode = 1;
});
