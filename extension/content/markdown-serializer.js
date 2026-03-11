(function () {
  const ns = globalThis.__chatgptConversationArchiveContent;

  if (!ns || ns.markdownSerializerLoaded) {
    return;
  }
  ns.markdownSerializerLoaded = true;

  ns.domToMarkdown = function domToMarkdown(root) {
    const markdown = ns.serializeBlocks(root, 0);
    return ns.cleanText(markdown);
  };

  ns.serializeBlocks = function serializeBlocks(parentNode, listDepth) {
    const chunks = [];
    const childNodes = Array.from(parentNode.childNodes || []);

    for (const child of childNodes) {
      const chunk = ns.serializeBlockNode(child, listDepth);
      if (chunk) {
        chunks.push(chunk);
      }
    }

    return chunks.join("");
  };

  ns.serializeBlockNode = function serializeBlockNode(node, listDepth) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = ns.cleanInlineText(node.textContent || "");
      return text ? `${text}\n\n` : "";
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const tag = node.tagName.toLowerCase();

    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      const content = ns.serializeInlineChildren(node).trim();
      return content ? `${"#".repeat(level)} ${content}\n\n` : "";
    }

    if (tag === "p") {
      const content = ns.serializeInlineChildren(node).trim();
      return content ? `${content}\n\n` : "";
    }

    if (tag === "pre") {
      return ns.serializePre(node);
    }

    if (tag === "blockquote") {
      const inner = ns.cleanText(ns.serializeBlocks(node, listDepth));
      if (!inner) return "";
      const quoted = inner
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
      return `${quoted}\n\n`;
    }

    if (tag === "ul" || tag === "ol") {
      return ns.serializeList(node, listDepth);
    }

    if (tag === "table") {
      return ns.serializeTable(node);
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
      return ns.serializeBlocks(node, listDepth);
    }

    const inline = ns.serializeInlineNode(node).trim();
    return inline ? `${inline}\n\n` : "";
  };

  ns.serializeList = function serializeList(listNode, listDepth) {
    const ordered = listNode.tagName.toLowerCase() === "ol";
    const items = Array.from(listNode.children).filter(
      (child) => child.tagName && child.tagName.toLowerCase() === "li"
    );
    if (!items.length) return "";

    const lines = [];
    let index = 1;

    for (const item of items) {
      const marker = ordered ? `${index}. ` : "- ";
      const content = ns.serializeListItem(item, listDepth);
      const contentLines = content ? content.split("\n") : [""];

      lines.push(`${"  ".repeat(listDepth)}${marker}${contentLines[0] || ""}`);
      for (let i = 1; i < contentLines.length; i += 1) {
        lines.push(`${"  ".repeat(listDepth + 1)}${contentLines[i]}`);
      }
      index += 1;
    }

    return `${lines.join("\n")}\n\n`;
  };

  ns.serializeListItem = function serializeListItem(liNode, listDepth) {
    const inlineParts = [];
    const nestedListParts = [];

    for (const child of Array.from(liNode.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName.toLowerCase();
        if (tag === "ul" || tag === "ol") {
          const nested = ns.cleanText(ns.serializeList(child, listDepth + 1));
          if (nested) nestedListParts.push(nested);
          continue;
        }
      }
      const inline = ns.serializeInlineNode(child);
      if (inline) inlineParts.push(inline);
    }

    const head = ns.cleanInlineText(inlineParts.join(" "));
    if (!nestedListParts.length) {
      return head;
    }

    return [head, ...nestedListParts].filter(Boolean).join("\n");
  };

  ns.serializePre = function serializePre(preNode) {
    const codeNode = preNode.querySelector("code");
    const sourceText = codeNode ? codeNode.textContent || "" : preNode.textContent || "";
    const code = sourceText.replace(/\n$/, "");
    const lang = ns.detectCodeLang(codeNode);
    return `\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
  };

  ns.detectCodeLang = function detectCodeLang(codeNode) {
    if (!codeNode) return "";
    const className = codeNode.getAttribute("class") || "";
    const match = className.match(/language-([a-z0-9_-]+)/i);
    return match ? match[1] : "";
  };

  ns.serializeTable = function serializeTable(tableNode) {
    const rows = Array.from(tableNode.querySelectorAll("tr"));
    if (!rows.length) return "";

    const grid = rows.map((row) =>
      Array.from(row.querySelectorAll("th,td")).map((cell) =>
        ns.cleanInlineText(ns.serializeInlineChildren(cell)) || " "
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
  };

  ns.serializeInlineChildren = function serializeInlineChildren(node) {
    return Array.from(node.childNodes || [])
      .map((child) => ns.serializeInlineNode(child))
      .join("");
  };

  ns.serializeInlineNode = function serializeInlineNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return ns.cleanInlineText(node.textContent || "");
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const tag = node.tagName.toLowerCase();

    if (tag === "br") return "\n";
    if (tag === "code") return `\`${ns.cleanInlineText(node.textContent || "")}\``;
    if (tag === "strong" || tag === "b") return `**${ns.serializeInlineChildren(node)}**`;
    if (tag === "em" || tag === "i") return `*${ns.serializeInlineChildren(node)}*`;
    if (tag === "a") {
      const text = ns.cleanInlineText(ns.serializeInlineChildren(node)) || "link";
      const href = node.getAttribute("href") || "";
      return href ? `[${text}](${href})` : text;
    }
    if (tag === "img") {
      const alt = ns.cleanInlineText(node.getAttribute("alt") || "image");
      const src = node.getAttribute("src") || "";
      return src ? `![${alt}](${src})` : "";
    }
    if (tag === "pre") return ns.serializePre(node).trim();

    return ns.serializeInlineChildren(node);
  };
})();
