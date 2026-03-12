(function () {
  const ns = globalThis.__chatgptConversationArchiveContent;

  if (!ns || ns.conversationTocLoaded) {
    return;
  }
  ns.conversationTocLoaded = true;

  ns.initializeConversationTocController = function initializeConversationTocController() {
    if (!ns.conversationTocController) {
      ns.conversationTocController = ns.createConversationTocController();
    }
    ns.conversationTocController.start();
  };

  ns.createConversationTocController = function createConversationTocController() {
    return {
      started: false,
      renderTimer: null,
      observer: null,
      observedMain: null,
      intersectionObserver: null,
      activeTurnId: "",
      previewTurnId: "",
      expanded: false,
      handleDocumentPointerDown: null,
      handleDocumentKeyDown: null,

      start() {
        if (this.started) return;
        this.started = true;
        ns.ensureConversationTocStyles();
        this.attachDocumentListeners();
        this.attachMutationWatcher();
        this.scheduleRender(0);
      },

      attachDocumentListeners() {
        if (!this.handleDocumentPointerDown) {
          this.handleDocumentPointerDown = (event) => {
            if (!this.expanded) return;
            if (ns.eventTargetsConversationToc(event)) return;
            this.previewTurnId = "";
            this.expanded = false;
            this.scheduleRender(0);
          };
          document.addEventListener("pointerdown", this.handleDocumentPointerDown, true);
        }

        if (!this.handleDocumentKeyDown) {
          this.handleDocumentKeyDown = (event) => {
            if (event.key !== "Escape" || !this.expanded) return;
            event.preventDefault();
            this.previewTurnId = "";
            this.expanded = false;
            this.scheduleRender(0);
          };
          document.addEventListener("keydown", this.handleDocumentKeyDown, true);
        }
      },

      attachMutationWatcher() {
        const main = ns.queryConversationMain();
        if (!main) {
          this.scheduleRender(500);
          return;
        }

        if (this.observedMain === main) {
          return;
        }

        if (this.observer) {
          this.observer.disconnect();
        }

        this.observer = new MutationObserver(() => {
          this.scheduleRender(80);
        });

        this.observer.observe(main, {
          childList: true,
          subtree: true
        });

        this.observedMain = main;
      },

      scheduleRender(delayMs = 0) {
        if (this.renderTimer) {
          clearTimeout(this.renderTimer);
        }

        this.renderTimer = setTimeout(() => {
          this.renderTimer = null;
          this.render();
        }, delayMs);
      },

      render() {
        this.attachDocumentListeners();
        this.attachMutationWatcher();

        if (!ns.isConversationRoute()) {
          ns.removeConversationTocRail();
          this.disconnectVisibilityObserver();
          return;
        }

        const main = ns.queryConversationMain();
        if (!main) {
          ns.removeConversationTocRail();
          this.scheduleRender(500);
          return;
        }

        const turnModels = ns.collectConversationTocTurnModels(main);
        if (!turnModels.length) {
          ns.removeConversationTocRail();
          this.disconnectVisibilityObserver();
          return;
        }

        this.activeTurnId = ns.resolveConversationTocActiveTurnId(this.activeTurnId, turnModels);
        this.previewTurnId = ns.resolveConversationTocPreviewTurnId(
          this.previewTurnId,
          this.activeTurnId,
          turnModels
        );
        const rail = ns.ensureConversationTocRail();
        ns.renderConversationTocRail({
          controller: this,
          rail,
          turnModels,
          activeTurnId: this.activeTurnId
        });
        this.observeTurnVisibility(turnModels);
      },

      setActiveTurn(turnId) {
        if (!turnId || this.activeTurnId === turnId) return;
        this.activeTurnId = turnId;
        this.scheduleRender(0);
      },

      setPreviewTurn(turnId) {
        if (!turnId || this.previewTurnId === turnId) return;
        this.previewTurnId = turnId;
        this.scheduleRender(0);
      },

      clearPreviewTurn() {
        if (!this.previewTurnId) return;
        this.previewTurnId = "";
        this.scheduleRender(0);
      },

      toggleExpanded(forceValue) {
        const nextValue = typeof forceValue === "boolean" ? forceValue : !this.expanded;
        if (this.expanded === nextValue) return;
        this.expanded = nextValue;
        if (!nextValue) {
          this.previewTurnId = "";
        }
        this.scheduleRender(0);
      },

      observeTurnVisibility(turnModels) {
        if (typeof IntersectionObserver !== "function") {
          return;
        }

        this.disconnectVisibilityObserver();

        this.intersectionObserver = new IntersectionObserver(
          (entries) => {
            const visibleEntry = ns.pickMostVisibleConversationEntry(entries);
            const turnId = visibleEntry?.target?.getAttribute("data-cgca-toc-turn-id") || "";
            if (turnId) {
              this.setActiveTurn(turnId);
            }
          },
          {
            threshold: [0.15, 0.3, 0.5, 0.75]
          }
        );

        for (const model of turnModels) {
          this.intersectionObserver.observe(model.article);
        }
      },

      disconnectVisibilityObserver() {
        if (this.intersectionObserver) {
          this.intersectionObserver.disconnect();
          this.intersectionObserver = null;
        }
      }
    };
  };

  ns.collectConversationTocTurnModels = function collectConversationTocTurnModels(main) {
    const articleNodes = ns.queryAllByFallbackSelectors(main, ns.SELECTOR_MAP.turnArticles);
    const effectiveArticles = articleNodes.length > 0 ? articleNodes : Array.from(main.querySelectorAll("article"));
    const models = [];

    for (let index = 0; index < effectiveArticles.length; index += 1) {
      const article = effectiveArticles[index];
      const roleNode = article.querySelector("[data-message-author-role]");
      const role = (roleNode?.getAttribute("data-message-author-role") || "").toLowerCase();
      if (role !== "assistant") continue;

      const turnId = ns.ensureConversationTocTurnId(article, index);
      const headings = ns.collectConversationTocHeadings(article, turnId);
      const label = ns.deriveConversationTocTurnLabel(effectiveArticles, index, article, headings, models.length + 1);

      models.push({
        turnId,
        article,
        headings,
        label,
        previewText: ns.extractConversationTocPreviewText(article)
      });
    }

    return models;
  };

  ns.ensureConversationTocTurnId = function ensureConversationTocTurnId(article, fallbackIndex) {
    const turnId =
      article.getAttribute("data-testid") ||
      article.getAttribute("data-turn-id") ||
      `cgca-conversation-turn-${fallbackIndex + 1}`;
    article.setAttribute("data-cgca-toc-turn-id", turnId);
    return turnId;
  };

  ns.collectConversationTocHeadings = function collectConversationTocHeadings(article, turnId) {
    const markdownRoots = ns.queryAllByFallbackSelectors(article, ns.SELECTOR_MAP.assistantMarkdown);
    const headings = [];
    let headingIndex = 0;

    for (const root of markdownRoots) {
      for (const heading of root.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
        const text = ns.cleanText(heading.textContent || "");
        if (!text) continue;
        if (heading.classList.contains("sr-only")) continue;

        const existingId = heading.id && String(heading.id).trim();
        const headingId = existingId || `cgca-toc-heading-${turnId}-${headingIndex + 1}`;
        if (!existingId) {
          heading.id = headingId;
        }
        heading.setAttribute("data-cgca-toc-heading", "true");

        headings.push({
          id: headingId,
          level: Number(heading.tagName.slice(1)) || 2,
          text,
          element: heading
        });
        headingIndex += 1;
      }
    }

    return headings;
  };

  ns.deriveConversationTocTurnLabel = function deriveConversationTocTurnLabel(
    effectiveArticles,
    articleIndex,
    article,
    headings,
    ordinal
  ) {
    const previousUserText = ns.findPreviousUserTurnText(effectiveArticles, articleIndex);
    const summarizedUserText = ns.summarizeConversationTocLabel(previousUserText, 28);
    if (summarizedUserText) {
      return summarizedUserText;
    }

    if (headings.length > 0) {
      return ns.summarizeConversationTocLabel(headings[0].text, 28);
    }

    const markdownRoot = ns.findFirstByFallbackSelectors(article, ns.SELECTOR_MAP.assistantMarkdown);
    const markdownText = ns.cleanText(markdownRoot?.textContent || "");
    if (markdownText) {
      return ns.summarizeConversationTocLabel(markdownText, 28);
    }

    const articleText = ns.cleanText(article.textContent || "");
    if (articleText) {
      return ns.summarizeConversationTocLabel(articleText, 28);
    }

    return `Assistant answer ${ordinal}`;
  };

  ns.findPreviousUserTurnText = function findPreviousUserTurnText(effectiveArticles, articleIndex) {
    for (let index = articleIndex - 1; index >= 0; index -= 1) {
      const article = effectiveArticles[index];
      const roleNode = article?.querySelector("[data-message-author-role]");
      const role = (roleNode?.getAttribute("data-message-author-role") || "").toLowerCase();
      if (role !== "user") continue;
      const text = ns.cleanText(roleNode?.textContent || article.textContent || "");
      if (text) {
        return text;
      }
    }
    return "";
  };

  ns.summarizeConversationTocLabel = function summarizeConversationTocLabel(text, maxLength = 28) {
    const cleaned = ns
      .cleanText(text)
      .replace(/\s+/g, " ")
      .replace(/\[[^\]]*\]\([^)]+\)/g, "")
      .trim();
    if (!cleaned) return "";
    const firstLine = cleaned.split("\n")[0].trim();
    if (firstLine.length <= maxLength) {
      return firstLine;
    }
    return `${firstLine.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
  };

  ns.resolveConversationTocActiveTurnId = function resolveConversationTocActiveTurnId(
    currentTurnId,
    turnModels
  ) {
    if (currentTurnId && turnModels.some((model) => model.turnId === currentTurnId)) {
      return currentTurnId;
    }

    const anchoredModel = turnModels.find(
      (model) => model.article.getAttribute("data-scroll-anchor") === "true"
    );
    if (anchoredModel) {
      return anchoredModel.turnId;
    }

    return turnModels[turnModels.length - 1]?.turnId || "";
  };

  ns.resolveConversationTocPreviewTurnId = function resolveConversationTocPreviewTurnId(
    currentPreviewTurnId,
    activeTurnId,
    turnModels
  ) {
    if (currentPreviewTurnId && turnModels.some((model) => model.turnId === currentPreviewTurnId)) {
      return currentPreviewTurnId;
    }
    if (activeTurnId && turnModels.some((model) => model.turnId === activeTurnId)) {
      return activeTurnId;
    }
    return turnModels[0]?.turnId || "";
  };

  ns.extractConversationTocPreviewText = function extractConversationTocPreviewText(article, maxLength = 120) {
    const markdownRoot = ns.findFirstByFallbackSelectors(article, ns.SELECTOR_MAP.assistantMarkdown);
    const sourceText = ns.cleanText(markdownRoot?.textContent || article.textContent || "");
    const cleaned = sourceText.replace(/\s+/g, " ").trim();
    if (!cleaned) {
      return "";
    }
    if (cleaned.length <= maxLength) {
      return cleaned;
    }
    return `${cleaned.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
  };

  ns.pickMostVisibleConversationEntry = function pickMostVisibleConversationEntry(entries) {
    const visible = (entries || []).filter((entry) => entry.isIntersecting);
    if (!visible.length) return null;

    return visible.sort((left, right) => {
      const ratioDelta = (right.intersectionRatio || 0) - (left.intersectionRatio || 0);
      if (Math.abs(ratioDelta) > 0.001) {
        return ratioDelta;
      }
      return Math.abs(left.boundingClientRect?.top || 0) - Math.abs(right.boundingClientRect?.top || 0);
    })[0];
  };

  ns.ensureConversationTocRail = function ensureConversationTocRail() {
    let rail = document.querySelector(`.${ns.CONVERSATION_TOC_CLASSES.rail}`);
    if (rail) return rail;

    rail = document.createElement("aside");
    rail.className = ns.CONVERSATION_TOC_CLASSES.rail;
    rail.setAttribute("aria-label", "Conversation jump rail");
    document.body.appendChild(rail);
    return rail;
  };

  ns.removeConversationTocRail = function removeConversationTocRail() {
    const rail = document.querySelector(`.${ns.CONVERSATION_TOC_CLASSES.rail}`);
    rail?.remove();
  };

  ns.eventTargetsConversationToc = function eventTargetsConversationToc(event) {
    const target = event?.target;
    return target instanceof Element
      ? Boolean(target.closest(`.${ns.CONVERSATION_TOC_CLASSES.rail}`))
      : false;
  };

  ns.renderConversationTocRail = function renderConversationTocRail({
    controller,
    rail,
    turnModels,
    activeTurnId
  }) {
    const classes = ns.CONVERSATION_TOC_CLASSES;
    rail.textContent = "";

    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = classes.pill;
    pill.setAttribute("aria-expanded", controller.expanded ? "true" : "false");
    pill.textContent = "目录";
    pill.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      controller.toggleExpanded();
    });
    rail.appendChild(pill);

    if (!controller.expanded) {
      return;
    }

    const surface = document.createElement("div");
    surface.className = classes.surface;
    rail.appendChild(surface);

    const displayedTurnId = controller.previewTurnId || activeTurnId;
    const activeModel = turnModels.find((model) => model.turnId === displayedTurnId) || turnModels[0];

    const card = document.createElement("div");
    card.className = classes.card;
    surface.appendChild(card);

    const eyebrow = document.createElement("div");
    eyebrow.className = classes.cardEyebrow;
    eyebrow.textContent = "当前回答";
    card.appendChild(eyebrow);

    const title = document.createElement("div");
    title.className = classes.cardTitle;
    title.textContent = activeModel.label;
    card.appendChild(title);

    const meta = document.createElement("div");
    meta.className = classes.cardMeta;
    meta.textContent = activeModel.headings.length > 0 ? `${activeModel.headings.length} 个小节` : "无标题";
    card.appendChild(meta);

    if (activeModel.previewText) {
      const excerpt = document.createElement("div");
      excerpt.className = classes.cardExcerpt;
      excerpt.textContent = activeModel.previewText;
      card.appendChild(excerpt);
    }

    if (activeModel.headings.length > 0) {
      const outline = document.createElement("nav");
      outline.className = classes.outline;
      outline.setAttribute("aria-label", "Current answer headings");
      for (let index = 0; index < activeModel.headings.length; index += 1) {
        const heading = activeModel.headings[index];
        const item = document.createElement("a");
        item.href = `#${heading.id}`;
        item.className = classes.outlineItem;
        if (heading.level >= 3) {
          item.classList.add(classes.outlineItemMinor);
        }
        if (index === 0) {
          item.classList.add(classes.outlineItemActive);
        }
        item.textContent = heading.text;
        item.addEventListener("click", (event) => {
          event.preventDefault();
          heading.element.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        outline.appendChild(item);
      }
      card.appendChild(outline);
    } else {
      const empty = document.createElement("div");
      empty.className = classes.empty;
      empty.textContent = "这段没有可跳转小节。";
      card.appendChild(empty);
    }

    const actions = document.createElement("div");
    actions.className = classes.cardActions;
    const jumpButton = document.createElement("button");
    jumpButton.type = "button";
    jumpButton.className = classes.cardActionButton;
    jumpButton.textContent = "跳到这里";
    jumpButton.addEventListener("click", (event) => {
      event.preventDefault();
      activeModel.article.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    actions.appendChild(jumpButton);
    card.appendChild(actions);

    const dotsViewport = document.createElement("div");
    dotsViewport.className = classes.dotsViewport;
    surface.appendChild(dotsViewport);

    const dots = document.createElement("div");
    dots.className = classes.dots;
    dotsViewport.appendChild(dots);

    for (const model of turnModels) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = classes.dot;
      dot.setAttribute("data-turn-id", model.turnId);
      dot.setAttribute("aria-label", model.label);
      if (model.turnId === activeModel.turnId) {
        dot.classList.add(classes.dotActive);
      }
      dot.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        controller.setPreviewTurn(model.turnId);
      });
      dot.addEventListener("mouseenter", () => {
        controller.setPreviewTurn(model.turnId);
      });

      const core = document.createElement("span");
      core.className = classes.dotCore;
      dot.appendChild(core);

      dots.appendChild(dot);
    }

    const activeDot = dots.querySelector(`.${classes.dot}.${classes.dotActive}`);
    if (activeDot && typeof activeDot.scrollIntoView === "function") {
      activeDot.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  };

  ns.ensureConversationTocStyles = function ensureConversationTocStyles() {
    if (document.getElementById("cgca-conversation-toc-styles")) {
      return;
    }

    const classes = ns.CONVERSATION_TOC_CLASSES;
    const style = document.createElement("style");
    style.id = "cgca-conversation-toc-styles";
    style.textContent = `
      .${classes.rail} {
        position: fixed;
        right: max(12px, env(safe-area-inset-right));
        top: max(88px, calc(env(safe-area-inset-top) + 24px));
        z-index: 40;
        width: auto;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 10px;
        pointer-events: none;
      }
      .${classes.rail} > * {
        pointer-events: auto;
      }
      .${classes.pill} {
        min-height: 32px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0 13px;
        border-radius: 999px;
        border: 1px solid rgba(15, 23, 42, 0.09);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.94));
        color: rgba(17, 24, 39, 0.86);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
        box-shadow:
          0 10px 24px rgba(15, 23, 42, 0.08),
          0 1px 0 rgba(255, 255, 255, 0.86) inset;
        backdrop-filter: blur(14px);
        cursor: pointer;
        transition:
          transform 0.16s ease,
          box-shadow 0.16s ease,
          border-color 0.16s ease,
          color 0.16s ease;
      }
      .${classes.pill}:hover {
        transform: translateY(-1px);
        box-shadow:
          0 14px 28px rgba(15, 23, 42, 0.11),
          0 1px 0 rgba(255, 255, 255, 0.92) inset;
      }
      .${classes.pill}[aria-expanded="true"] {
        border-color: rgba(16, 163, 127, 0.18);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(240, 253, 250, 0.94));
        color: rgba(15, 118, 110, 0.96);
      }
      .${classes.surface} {
        display: grid;
        grid-template-columns: minmax(208px, 248px) 28px;
        align-items: start;
        gap: 12px;
      }
      .${classes.dotsViewport} {
        max-height: min(60vh, calc(100dvh - 176px));
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-width: none;
        padding: 4px 2px 4px 0;
      }
      .${classes.dotsViewport}::-webkit-scrollbar {
        display: none;
      }
      .${classes.dots} {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 8px 0;
        position: relative;
      }
      .${classes.dots}::before {
        content: "";
        position: absolute;
        top: 0;
        bottom: 0;
        left: 50%;
        width: 1px;
        transform: translateX(-50%);
        background: linear-gradient(
          180deg,
          rgba(203, 213, 225, 0),
          rgba(203, 213, 225, 0.72) 12%,
          rgba(203, 213, 225, 0.72) 88%,
          rgba(203, 213, 225, 0)
        );
      }
      .${classes.dot} {
        display: inline-flex;
        align-items: center;
        margin: 0;
        padding: 6px;
        border: 0;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.76);
        box-shadow:
          0 1px 0 rgba(255, 255, 255, 0.86) inset,
          0 6px 14px rgba(15, 23, 42, 0.06);
        cursor: pointer;
        position: relative;
        z-index: 1;
        transition:
          transform 0.16s ease,
          background-color 0.16s ease,
          box-shadow 0.16s ease;
      }
      .${classes.dot}:hover {
        transform: scale(1.04);
        background: rgba(255, 255, 255, 0.96);
      }
      .${classes.dotCore} {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.88);
        box-shadow: 0 0 0 4px rgba(148, 163, 184, 0.12);
        transition:
          transform 0.16s ease,
          background-color 0.16s ease,
          box-shadow 0.16s ease;
      }
      .${classes.dot}.${classes.dotActive} .${classes.dotCore} {
        width: 9px;
        height: 9px;
        background: #10a37f;
        box-shadow:
          0 0 0 5px rgba(16, 163, 127, 0.16),
          0 0 0 10px rgba(16, 163, 127, 0.06);
      }
      .${classes.card} {
        max-height: min(60vh, calc(100dvh - 176px));
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 14px 14px 12px;
        border-radius: 18px;
        border: 1px solid rgba(15, 23, 42, 0.08);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.97), rgba(248, 250, 252, 0.95));
        box-shadow:
          0 20px 36px rgba(15, 23, 42, 0.12),
          0 1px 0 rgba(255, 255, 255, 0.92) inset;
        backdrop-filter: blur(18px);
        scrollbar-width: thin;
        scrollbar-color: rgba(148, 163, 184, 0.6) transparent;
      }
      .${classes.card}::-webkit-scrollbar {
        width: 8px;
      }
      .${classes.card}::-webkit-scrollbar-thumb {
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.52);
      }
      .${classes.cardEyebrow} {
        font-size: 11px;
        font-weight: 700;
        color: rgba(15, 118, 110, 0.9);
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .${classes.cardTitle} {
        margin-top: 8px;
        color: rgba(17, 24, 39, 0.96);
        font-size: 15px;
        font-weight: 700;
        line-height: 1.42;
        display: -webkit-box;
        overflow: hidden;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      .${classes.cardMeta} {
        margin-top: 8px;
        color: rgba(100, 116, 139, 0.92);
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        line-height: 1.4;
      }
      .${classes.cardExcerpt} {
        margin-top: 10px;
        color: rgba(51, 65, 85, 0.92);
        font-size: 12px;
        line-height: 1.55;
        display: -webkit-box;
        overflow: hidden;
        -webkit-line-clamp: 4;
        -webkit-box-orient: vertical;
      }
      .${classes.outline} {
        display: grid;
        gap: 4px;
        margin-top: 12px;
      }
      .${classes.outlineItem} {
        display: block;
        padding: 8px 10px;
        border-radius: 12px;
        color: rgba(31, 41, 55, 0.94);
        text-decoration: none;
        font-size: 12px;
        line-height: 1.42;
        transition:
          background-color 0.16s ease,
          color 0.16s ease,
          transform 0.16s ease;
      }
      .${classes.outlineItem}:hover {
        background: rgba(241, 245, 249, 0.9);
        transform: translateX(1px);
      }
      .${classes.outlineItem}.${classes.outlineItemActive} {
        background: linear-gradient(180deg, rgba(16, 163, 127, 0.14), rgba(16, 163, 127, 0.08));
        color: #0f766e;
        font-weight: 600;
      }
      .${classes.outlineItem}.${classes.outlineItemMinor} {
        padding-left: 22px;
        color: rgba(71, 85, 105, 0.9);
      }
      .${classes.empty} {
        margin-top: 12px;
        color: rgba(100, 116, 139, 0.94);
        font-size: 12px;
        line-height: 1.5;
      }
      .${classes.cardActions} {
        display: flex;
        justify-content: flex-start;
        margin-top: 12px;
      }
      .${classes.cardActionButton} {
        min-height: 30px;
        padding: 0 12px;
        border: 1px solid rgba(15, 118, 110, 0.16);
        border-radius: 999px;
        background: linear-gradient(180deg, rgba(240, 253, 250, 0.96), rgba(220, 252, 231, 0.92));
        color: rgba(15, 118, 110, 0.96);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
        cursor: pointer;
        transition:
          transform 0.16s ease,
          box-shadow 0.16s ease,
          border-color 0.16s ease;
      }
      .${classes.cardActionButton}:hover {
        transform: translateY(-1px);
        box-shadow: 0 8px 16px rgba(16, 163, 127, 0.12);
        border-color: rgba(15, 118, 110, 0.24);
      }
      @media (max-width: 1120px) {
        .${classes.rail} {
          display: none;
        }
      }
    `;
    document.head.appendChild(style);
  };
})();
