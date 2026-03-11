(function () {
  const ns = globalThis.__chatgptConversationArchiveContent;

  if (!ns || ns.historyExtractorLoaded) {
    return;
  }
  ns.historyExtractorLoaded = true;

  ns.extractCurrentConversationWhenReady = async function extractCurrentConversationWhenReady(options) {
    const { timeoutMs = 15_000, intervalMs = 250 } = options || {};
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const idMatch = window.location.pathname.match(/\/c\/([0-9a-f-]+)/i);
      if (idMatch) {
        const turnNodes = ns.getTurnNodesInOrder();
        if (turnNodes.length > 0) {
          return ns.extractCurrentConversation();
        }
      }
      await ns.sleep(intervalMs);
    }

    const turnCount = ns.getTurnNodesInOrder().length;
    throw new Error(
      [
        "No conversation messages found on the page.",
        `url=${window.location.href}`,
        `title=${document.title || "unknown"}`,
        `readyState=${document.readyState}`,
        `turnCount=${turnCount}`
      ].join(" ")
    );
  };

  ns.extractCurrentConversation = function extractCurrentConversation() {
    const idMatch = window.location.pathname.match(/\/c\/([0-9a-f-]+)/i);
    if (!idMatch) {
      throw new Error("Current page is not a conversation route (/c/<id>).");
    }

    const conversationId = idMatch[1];
    const title = ns.normalizeTitle(document.title);
    const turnNodes = ns.getTurnNodesInOrder();

    if (!turnNodes.length) {
      throw new Error("No conversation messages found on the page.");
    }

    const turns = turnNodes
      .map((node) => {
        const role = (node.getAttribute("data-message-author-role") || "unknown").toLowerCase();
        const { text, markdown } = ns.getTurnContent(node, role);
        const attachments = ns.getTurnAttachments(node);
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
  };

  ns.getTurnNodesInOrder = function getTurnNodesInOrder() {
    const articleTurns = ns
      .queryAllByFallbackSelectors(document, ns.SELECTOR_MAP.turnArticles)
      .map((article) => ns.findFirstByFallbackSelectors(article, ns.SELECTOR_MAP.roleNodes))
      .filter(Boolean);

    if (articleTurns.length > 0) {
      return articleTurns;
    }

    return ns.queryAllByFallbackSelectors(document, ns.SELECTOR_MAP.roleNodes);
  };

  ns.getTurnContent = function getTurnContent(turnNode, role) {
    const markdownNode = ns.findFirstByFallbackSelectors(turnNode, ns.SELECTOR_MAP.assistantMarkdown);
    if (markdownNode) {
      const markdown = ns.cleanText(ns.domToMarkdown(markdownNode));
      if (markdown) {
        return {
          text: markdown,
          markdown
        };
      }
    }

    const text = ns.cleanText(turnNode.innerText);
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
  };

  ns.getTurnAttachments = function getTurnAttachments(turnNode) {
    const images = Array.from(turnNode.querySelectorAll("img[src]"));
    return images
      .map((img) => ({
        src: img.src,
        alt: img.alt || ""
      }))
      .filter((item) => Boolean(item.src));
  };

  ns.extractHistoryLinksWithLoadMore = async function extractHistoryLinksWithLoadMore(options) {
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
      const before = ns.extractHistoryLinks();
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

      const scrolled = ns.scrollHistoryContainersToBottom();
      if (!scrolled && idleRounds >= 1) {
        return before;
      }

      await ns.sleep(waitMs);
      const after = ns.extractHistoryLinks();
      if (after.length > previousCount) {
        previousCount = after.length;
        idleRounds = 0;
      }
    }

    return ns.extractHistoryLinks();
  };

  ns.extractHistoryLinks = function extractHistoryLinks() {
    const navContainer = ns.findFirstByFallbackSelectors(document, ns.SELECTOR_MAP.sidebarNav);
    const scopedContainer = navContainer || ns.getHistoryScopedContainer();
    const anchors = ns.queryAllByFallbackSelectors(scopedContainer, ns.SELECTOR_MAP.historyAnchors);
    const effectiveAnchors =
      anchors.length > 0
        ? anchors
        : ns.queryAllByFallbackSelectors(document, ns.SELECTOR_MAP.historyAnchors);

    const seen = new Set();
    const items = [];

    for (const anchor of effectiveAnchors) {
      const href = anchor.getAttribute("href");
      if (!href) continue;
      const id = ns.getConversationIdFromHref(href);
      if (!id) continue;
      if (seen.has(id)) continue;
      seen.add(id);

      items.push({
        id,
        title: ns.cleanText(anchor.textContent) || "Untitled",
        url: new URL(href, window.location.origin).toString()
      });
    }

    return items;
  };

  ns.getHistoryScopedContainer = function getHistoryScopedContainer() {
    return ns.findFirstByFallbackSelectors(document, ns.SELECTOR_MAP.historyContainers) || document;
  };

  ns.scrollHistoryContainersToBottom = function scrollHistoryContainersToBottom() {
    const scopedContainer = ns.getHistoryScopedContainer();
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
      if (!ns.isScrollableElement(element)) continue;
      const before = element.scrollTop;
      element.scrollTop = element.scrollHeight;
      if (element.scrollTop > before) {
        moved = true;
      }
    }

    return moved;
  };

  ns.isScrollableElement = function isScrollableElement(element) {
    if (!element || typeof element.scrollHeight !== "number") return false;
    return element.scrollHeight - element.clientHeight > 20;
  };
})();
