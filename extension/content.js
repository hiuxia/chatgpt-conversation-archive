(function () {
  if (globalThis.__chatgptConversationArchiveInjected) {
    return;
  }
  globalThis.__chatgptConversationArchiveInjected = true;

  const MESSAGE_TYPES = {
    PING: "PING",
    EXTRACT_CURRENT_CONVERSATION: "EXTRACT_CURRENT_CONVERSATION",
    EXTRACT_HISTORY_LINKS: "EXTRACT_HISTORY_LINKS"
  };

  const SELECTOR_MAP = {
    historyContainers: [
      'nav[aria-label="Chat history"] #history',
      "#history",
      'nav[aria-label="Chat history"]'
    ],
    historyAnchors: ['a[href^="/c/"]', 'a[href*="/c/"]'],
    turnArticles: ['article[data-testid^="conversation-turn-"]'],
    roleNodes: ["[data-message-author-role]"],
    assistantMarkdown: [".markdown.prose", ".markdown", "[class*='markdown']"]
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === MESSAGE_TYPES.PING) {
      sendResponse({
        ok: true,
        pong: true,
        url: window.location.href,
        readyState: document.readyState
      });
      return false;
    }

    if (message?.type === MESSAGE_TYPES.EXTRACT_CURRENT_CONVERSATION) {
      extractCurrentConversationWhenReady({
        timeoutMs: 20_000,
        intervalMs: 300
      })
        .then((data) => sendResponse({ ok: true, data }))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error?.message || "Failed to extract current conversation."
          })
        );
      return true;
    }

    if (message?.type === MESSAGE_TYPES.EXTRACT_HISTORY_LINKS) {
      extractHistoryLinksWithLoadMore({
        maxIterations: 18,
        idleRoundsToStop: 3,
        waitMs: 350,
        maxDurationMs: 15_000
      })
        .then((items) => sendResponse({ ok: true, items }))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error?.message || "Failed to extract history links."
          })
        );
      return true;
    }

    return false;
  });

  async function extractCurrentConversationWhenReady(options) {
    const { timeoutMs = 15_000, intervalMs = 250 } = options || {};
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const idMatch = window.location.pathname.match(/\/c\/([0-9a-f-]+)/i);
      if (idMatch) {
        const turnNodes = getTurnNodesInOrder();
        if (turnNodes.length > 0) {
          return extractCurrentConversation();
        }
      }
      await sleep(intervalMs);
    }

    const turnCount = getTurnNodesInOrder().length;
    throw new Error(
      [
        "No conversation messages found on the page.",
        `url=${window.location.href}`,
        `title=${document.title || "unknown"}`,
        `readyState=${document.readyState}`,
        `turnCount=${turnCount}`
      ].join(" ")
    );
  }

  function extractCurrentConversation() {
    const idMatch = window.location.pathname.match(/\/c\/([0-9a-f-]+)/i);
    if (!idMatch) {
      throw new Error("Current page is not a conversation route (/c/<id>).");
    }

    const conversationId = idMatch[1];
    const title = normalizeTitle(document.title);
    const turnNodes = getTurnNodesInOrder();

    if (!turnNodes.length) {
      throw new Error("No conversation messages found on the page.");
    }

    const turns = turnNodes
      .map((node) => {
        const role = (node.getAttribute("data-message-author-role") || "unknown").toLowerCase();
        const { text, markdown } = getTurnContent(node, role);
        const attachments = getTurnAttachments(node);
        return {
          role,
          text,
          markdown,
          attachments
        };
      })
      .filter((item) => item.text || item.attachments.length > 0);

    return {
      id: conversationId,
      title,
      sourceUrl: window.location.href,
      exportedAt: new Date().toISOString(),
      turns
    };
  }

  function getTurnNodesInOrder() {
    const articleTurns = queryAllByFallbackSelectors(document, SELECTOR_MAP.turnArticles)
      .map((article) => findFirstByFallbackSelectors(article, SELECTOR_MAP.roleNodes))
      .filter(Boolean);

    if (articleTurns.length > 0) {
      return articleTurns;
    }

    return queryAllByFallbackSelectors(document, SELECTOR_MAP.roleNodes);
  }

  function getTurnContent(turnNode, role) {
    const markdownNode = findFirstByFallbackSelectors(turnNode, SELECTOR_MAP.assistantMarkdown);
    if (markdownNode) {
      const markdown = cleanText(domToMarkdown(markdownNode));
      if (markdown) {
        return {
          text: markdown,
          markdown
        };
      }
    }

    const text = cleanText(turnNode.innerText);
    if (role === "user") {
      return {
        text,
        markdown: text
      };
    }
    return {
      text,
      markdown: ""
    };
  }

  function getTurnAttachments(turnNode) {
    const images = Array.from(turnNode.querySelectorAll("img[src]"));
    return images
      .map((img) => ({
        src: img.src,
        alt: img.alt || ""
      }))
      .filter((item) => Boolean(item.src));
  }

  async function extractHistoryLinksWithLoadMore(options) {
    const {
      maxIterations = 14,
      idleRoundsToStop = 2,
      waitMs = 300,
      maxDurationMs = 12_000
    } = options || {};

    const startedAt = Date.now();
    let idleRounds = 0;
    let previousCount = 0;

    for (let i = 0; i < maxIterations; i += 1) {
      const before = extractHistoryLinks();
      const beforeCount = before.length;
      if (beforeCount > previousCount) {
        previousCount = beforeCount;
        idleRounds = 0;
      } else {
        idleRounds += 1;
      }

      if (idleRounds >= idleRoundsToStop) {
        return before;
      }

      if (Date.now() - startedAt > maxDurationMs) {
        return before;
      }

      const scrolled = scrollHistoryContainersToBottom();
      if (!scrolled && idleRounds >= 1) {
        return before;
      }

      await sleep(waitMs);
      const after = extractHistoryLinks();
      if (after.length > previousCount) {
        previousCount = after.length;
        idleRounds = 0;
      }
    }

    return extractHistoryLinks();
  }

  function extractHistoryLinks() {
    const scopedContainer = getHistoryScopedContainer();
    const anchors = queryAllByFallbackSelectors(scopedContainer, SELECTOR_MAP.historyAnchors);
    const effectiveAnchors =
      anchors.length > 0
        ? anchors
        : queryAllByFallbackSelectors(document, SELECTOR_MAP.historyAnchors);

    const seen = new Set();
    const items = [];

    for (const anchor of effectiveAnchors) {
      const href = anchor.getAttribute("href");
      if (!href) continue;
      const match = href.match(/\/c\/([0-9a-f-]+)/i);
      if (!match) continue;

      const id = match[1];
      if (seen.has(id)) continue;
      seen.add(id);

      items.push({
        id,
        title: cleanText(anchor.textContent) || "Untitled",
        url: new URL(href, window.location.origin).toString()
      });
    }

    return items;
  }

  function getHistoryScopedContainer() {
    return findFirstByFallbackSelectors(document, SELECTOR_MAP.historyContainers) || document;
  }

  function scrollHistoryContainersToBottom() {
    const scopedContainer = getHistoryScopedContainer();
    const containerElement = scopedContainer instanceof Element ? scopedContainer : null;
    const candidates = [
      containerElement,
      containerElement?.parentElement,
      containerElement?.closest("nav"),
      containerElement?.closest("aside"),
      document.scrollingElement
    ].filter(Boolean);

    const unique = [];
    for (const candidate of candidates) {
      if (!candidate || unique.includes(candidate)) continue;
      unique.push(candidate);
    }

    let moved = false;
    for (const element of unique) {
      if (!isScrollableElement(element)) continue;
      const before = element.scrollTop;
      element.scrollTop = element.scrollHeight;
      if (element.scrollTop > before) {
        moved = true;
      }
    }

    return moved;
  }

  function isScrollableElement(element) {
    if (!element || typeof element.scrollHeight !== "number") return false;
    return element.scrollHeight - element.clientHeight > 20;
  }

  function queryAllByFallbackSelectors(root, selectors) {
    for (const selector of selectors) {
      const nodes = Array.from(root.querySelectorAll(selector));
      if (nodes.length > 0) {
        return nodes;
      }
    }
    return [];
  }

  function findFirstByFallbackSelectors(root, selectors) {
    for (const selector of selectors) {
      const node = root.querySelector(selector);
      if (node) {
        return node;
      }
    }
    return null;
  }

  function cleanText(text) {
    return (text || "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function domToMarkdown(root) {
    const markdown = serializeBlocks(root, 0);
    return cleanText(markdown);
  }

  function serializeBlocks(parentNode, listDepth) {
    const chunks = [];
    const childNodes = Array.from(parentNode.childNodes || []);

    for (const child of childNodes) {
      const chunk = serializeBlockNode(child, listDepth);
      if (chunk) {
        chunks.push(chunk);
      }
    }

    return chunks.join("");
  }

  function serializeBlockNode(node, listDepth) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = cleanInlineText(node.textContent || "");
      return text ? `${text}\n\n` : "";
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const tag = node.tagName.toLowerCase();

    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      const content = serializeInlineChildren(node).trim();
      return content ? `${"#".repeat(level)} ${content}\n\n` : "";
    }

    if (tag === "p") {
      const content = serializeInlineChildren(node).trim();
      return content ? `${content}\n\n` : "";
    }

    if (tag === "pre") {
      return serializePre(node);
    }

    if (tag === "blockquote") {
      const inner = cleanText(serializeBlocks(node, listDepth));
      if (!inner) return "";
      const quoted = inner
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
      return `${quoted}\n\n`;
    }

    if (tag === "ul" || tag === "ol") {
      return serializeList(node, listDepth);
    }

    if (tag === "table") {
      return serializeTable(node);
    }

    if (tag === "hr") {
      return "---\n\n";
    }

    if (tag === "br") {
      return "\n";
    }

    const blockLike = new Set([
      "div",
      "section",
      "article",
      "main",
      "header",
      "footer",
      "details",
      "summary",
      "figure",
      "figcaption"
    ]);

    if (blockLike.has(tag)) {
      return serializeBlocks(node, listDepth);
    }

    const inline = serializeInlineNode(node).trim();
    return inline ? `${inline}\n\n` : "";
  }

  function serializeList(listNode, listDepth) {
    const ordered = listNode.tagName.toLowerCase() === "ol";
    const items = Array.from(listNode.children).filter(
      (child) => child.tagName && child.tagName.toLowerCase() === "li"
    );
    if (!items.length) return "";

    const lines = [];
    let index = 1;

    for (const item of items) {
      const marker = ordered ? `${index}. ` : "- ";
      const content = serializeListItem(item, listDepth);
      const contentLines = content ? content.split("\n") : [""];

      lines.push(`${"  ".repeat(listDepth)}${marker}${contentLines[0] || ""}`);
      for (let i = 1; i < contentLines.length; i += 1) {
        lines.push(`${"  ".repeat(listDepth + 1)}${contentLines[i]}`);
      }
      index += 1;
    }

    return `${lines.join("\n")}\n\n`;
  }

  function serializeListItem(liNode, listDepth) {
    const inlineParts = [];
    const nestedListParts = [];

    for (const child of Array.from(liNode.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName.toLowerCase();
        if (tag === "ul" || tag === "ol") {
          const nested = cleanText(serializeList(child, listDepth + 1));
          if (nested) nestedListParts.push(nested);
          continue;
        }
      }
      const inline = serializeInlineNode(child);
      if (inline) inlineParts.push(inline);
    }

    const head = cleanInlineText(inlineParts.join(" "));
    if (!nestedListParts.length) {
      return head;
    }

    return [head, ...nestedListParts].filter(Boolean).join("\n");
  }

  function serializePre(preNode) {
    const codeNode = preNode.querySelector("code");
    const sourceText = codeNode ? codeNode.textContent || "" : preNode.textContent || "";
    const code = sourceText.replace(/\n$/, "");
    const lang = detectCodeLang(codeNode);
    return `\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
  }

  function detectCodeLang(codeNode) {
    if (!codeNode) return "";
    const className = codeNode.getAttribute("class") || "";
    const match = className.match(/language-([a-z0-9_-]+)/i);
    return match ? match[1] : "";
  }

  function serializeTable(tableNode) {
    const rows = Array.from(tableNode.querySelectorAll("tr"));
    if (!rows.length) return "";

    const grid = rows.map((row) =>
      Array.from(row.querySelectorAll("th,td")).map((cell) =>
        cleanInlineText(serializeInlineChildren(cell)) || " "
      )
    );
    if (!grid.length || !grid[0].length) return "";

    const header = grid[0];
    const separator = header.map(() => "---");
    const body = grid.slice(1);

    const lines = [
      `| ${header.join(" | ")} |`,
      `| ${separator.join(" | ")} |`,
      ...body.map((cells) => `| ${cells.join(" | ")} |`)
    ];

    return `${lines.join("\n")}\n\n`;
  }

  function serializeInlineChildren(node) {
    return Array.from(node.childNodes || [])
      .map((child) => serializeInlineNode(child))
      .join("");
  }

  function serializeInlineNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return cleanInlineText(node.textContent || "");
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const tag = node.tagName.toLowerCase();

    if (tag === "br") return "\n";
    if (tag === "code") return `\`${cleanInlineText(node.textContent || "")}\``;
    if (tag === "strong" || tag === "b") return `**${serializeInlineChildren(node)}**`;
    if (tag === "em" || tag === "i") return `*${serializeInlineChildren(node)}*`;
    if (tag === "a") {
      const text = cleanInlineText(serializeInlineChildren(node)) || "link";
      const href = node.getAttribute("href") || "";
      return href ? `[${text}](${href})` : text;
    }
    if (tag === "img") {
      const alt = cleanInlineText(node.getAttribute("alt") || "image");
      const src = node.getAttribute("src") || "";
      return src ? `![${alt}](${src})` : "";
    }
    if (tag === "pre") return serializePre(node).trim();

    return serializeInlineChildren(node);
  }

  function cleanInlineText(text) {
    return (text || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n");
  }

  function normalizeTitle(rawTitle) {
    const title = (rawTitle || "").replace(/\s*-\s*ChatGPT\s*$/i, "").trim();
    return title || "Untitled Conversation";
  }
})();
